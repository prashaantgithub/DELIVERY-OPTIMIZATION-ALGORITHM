document.addEventListener('DOMContentLoaded', async () => {
    const accessToken = sessionStorage.getItem('accessToken');
    if (!accessToken) {
        window.location.href = 'login.html';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('accessToken');
        window.location.href = 'login.html';
    });
    
    const loader = document.createElement('div');
    loader.className = 'loader';
    const mainContent = document.querySelector('.analytics-grid');
    mainContent.appendChild(loader);

    try {
        const analyticsData = await fetchAgentAnalytics(accessToken);
        mainContent.removeChild(loader);

        createMySuccessRateChart(analyticsData);
        displayMyAverageRating(analyticsData);
        displayAveragePickups(analyticsData);
        createCustomerRescheduleChart(analyticsData);
        createMyFailureReasonsChart(analyticsData);

    } catch (error) {
        mainContent.removeChild(loader);
        console.error("Failed to load agent analytics", error);
        document.getElementById('avg-rating-value').textContent = 'Error';
        document.getElementById('avg-pickups-value').textContent = 'Error';
    }

    setupNotifications(accessToken);
});

function createMySuccessRateChart(data) {
    const ctx = document.getElementById('mySuccessRateChart').getContext('2d');
    const trendEl = document.getElementById('success-rate-trend');
    if (!ctx) return;
    
    const trend = data.success_rate_trend_percentage;
    if (trend !== null) {
        if (trend >= 0) {
            trendEl.className = 'trend-indicator positive';
            trendEl.innerHTML = `▲ ${trend.toFixed(1)}%`;
        } else {
            trendEl.className = 'trend-indicator negative';
            trendEl.innerHTML = `▼ ${Math.abs(trend).toFixed(1)}%`;
        }
    }

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Successful', 'Failed'],
            datasets: [{
                data: [data.successful_deliveries, data.failed_deliveries],
                backgroundColor: ['#5cb85c', '#d9534f'],
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                }
            }
        }
    });
}

function displayMyAverageRating(data) {
    const ratingValueEl = document.getElementById('avg-rating-value');
    if (!ratingValueEl) return;
    ratingValueEl.textContent = data.average_rating ? `${data.average_rating} ★` : 'N/A';
}

function displayAveragePickups(data) {
    const pickupsValueEl = document.getElementById('avg-pickups-value');
    if (!pickupsValueEl) return;
    pickupsValueEl.textContent = data.average_pickups_per_day !== null ? data.average_pickups_per_day : 'N/A';
}

function createCustomerRescheduleChart(data) {
    const ctx = document.getElementById('customerRescheduleChart').getContext('2d');
    const chartContainer = ctx.canvas.parentElement;
    if (!ctx) return;

    const rescheduleReasons = data.customer_reschedule_reasons;
    const labels = Object.keys(rescheduleReasons);

    if (labels.length === 0) {
        ctx.canvas.style.display = 'none';
        const p = document.createElement('p');
        p.textContent = 'No customer reschedule data available.';
        chartContainer.appendChild(p);
        return;
    }
    
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels.map(l => l.replace(/_/g, ' ')),
            datasets: [{
                data: Object.values(rescheduleReasons),
                backgroundColor: ['#f0ad4e', '#5bc0de', '#0275d8', '#5cb85c', '#d9534f']
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function createMyFailureReasonsChart(data) {
    const ctx = document.getElementById('myFailureReasonsChart').getContext('2d');
    const chartContainer = ctx.canvas.parentElement;
    if (!ctx) return;
    
    const failureReasons = data.failure_reason_counts;
    const labels = Object.keys(failureReasons);
    
    if (labels.length === 0) {
        ctx.canvas.style.display = 'none';
        const p = document.createElement('p');
        p.textContent = 'No failure data available.';
        chartContainer.appendChild(p);
        return;
    }

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => l.replace(/_/g, ' ')),
            datasets: [{
                label: 'Failure Count',
                data: Object.values(failureReasons),
                backgroundColor: '#d9534f'
            }]
        },
        options: { 
            indexAxis: 'y',
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}