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
    
    const mainContent = document.querySelector('.analytics-grid');
    const loader = document.createElement('div');
    loader.className = 'loader';
    mainContent.appendChild(loader);

    try {
        const analyticsData = await fetchAdminAnalytics(accessToken);
        mainContent.removeChild(loader);
        
        createSuccessRateChart(analyticsData.success_rate);
        createFailureReasonsChart(analyticsData.top_agent_failure_reasons);
        createCancellationReasonsChart(analyticsData.top_customer_cancellation_reasons);
        createAgentPerformanceChart(analyticsData.agent_performance);
        createDeliveriesOverTimeChart(analyticsData.deliveries_last_7_days);
        createPeakHourChart(analyticsData.peak_hours);
    } catch(error) {
        mainContent.removeChild(loader);
        mainContent.innerHTML = `<p>Error loading analytics data: ${error.message}</p>`;
    }
    
    setupNotifications(accessToken);
});

function createSuccessRateChart(data) {
    const ctx = document.getElementById('successRateChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Successful', 'Failed'],
            datasets: [{ data: [data.successful, data.failed], backgroundColor: ['#5cb85c', '#d9534f'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function createFailureReasonsChart(data) {
    const ctx = document.getElementById('failureReasonsChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(data).map(k => k.replace(/_/g, ' ')),
            datasets: [{ data: Object.values(data), backgroundColor: ['#d9534f', '#f0ad4e', '#5bc0de', '#0275d8', '#333'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function createCancellationReasonsChart(data) {
    const ctx = document.getElementById('cancellationReasonsChart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(data).map(k => k.replace(/_/g, ' ')),
            datasets: [{ data: Object.values(data), backgroundColor: ['#f0ad4e', '#5bc0de', '#0275d8', '#d9534f', '#333'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function createAgentPerformanceChart(data) {
    const ctx = document.getElementById('agentPerformanceChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(a => a.full_name),
            datasets: [{ label: 'Performance Score', data: data.map(a => a.performance_score), backgroundColor: '#0275d8' }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true } } }
    });
}

function createDeliveriesOverTimeChart(data) {
    const ctx = document.getElementById('deliveriesOverTimeChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.day).toLocaleDateString([], {month: 'short', day: 'numeric'})),
            datasets: [{ label: 'Successful Deliveries', data: data.map(d => d.count), borderColor: '#5cb85c', tension: 0.1 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function createPeakHourChart(data) {
    const ctx = document.getElementById('peakHourChart').getContext('2d');
    const allHours = Object.keys(data);
    const relevantHours = allHours.filter(h => h >= 6 && h <= 22);
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: relevantHours.map(h => `${h}:00`),
            datasets: [{ label: 'Total Orders', data: relevantHours.map(h => data[h]), backgroundColor: '#5bc0de' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}