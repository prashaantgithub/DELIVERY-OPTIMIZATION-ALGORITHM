let ordersData = [];

document.addEventListener('DOMContentLoaded', () => {
    const accessToken = sessionStorage.getItem('accessToken');
    if (!accessToken) {
        window.location.href = 'login.html';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const activeTbody = document.getElementById('active-orders-tbody');
    const historyTbody = document.getElementById('history-orders-tbody');

    const detailsModal = document.getElementById('order-details-modal');
    const closeDetailsModalBtn = detailsModal.querySelector('.close-btn');
    const rescheduleModal = document.getElementById('reschedule-modal');
    const closeRescheduleModalBtn = rescheduleModal.querySelector('.close-btn');
    const feedbackModal = document.getElementById('feedback-modal');
    const closeFeedbackModalBtn = feedbackModal.querySelector('.close-btn');
    const mapModal = document.getElementById('map-modal');
    const closeMapModalBtn = mapModal.querySelector('.close-btn');
    
    const rescheduleOrderIdSpan = document.getElementById('reschedule-order-id');
    const rescheduleReasonSelect = document.getElementById('reschedule-reason');
    const rescheduleDetailsInput = document.getElementById('reschedule-details');
    const confirmRescheduleBtn = document.getElementById('confirm-reschedule-btn');

    const feedbackOrderIdSpan = document.getElementById('feedback-order-id');
    const ratingSelect = document.getElementById('rating-select');
    const feedbackTextInput = document.getElementById('feedback-text');
    const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
    
    const mapOrderIdSpan = document.getElementById('map-order-id');
    
    let currentOrderId = null;
    let refreshInterval = null;

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('accessToken');
        window.location.href = 'login.html';
    });
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => {
                if(content.id === button.dataset.target) {
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });
        });
    });

    closeDetailsModalBtn.addEventListener('click', () => detailsModal.style.display = 'none');
    closeRescheduleModalBtn.addEventListener('click', () => rescheduleModal.style.display = 'none');
    closeFeedbackModalBtn.addEventListener('click', () => feedbackModal.style.display = 'none');
    
    const closeMap = () => {
        mapModal.style.display = 'none';
        stopAnimation(currentOrderId);
    };
    closeMapModalBtn.addEventListener('click', closeMap);
    
    window.addEventListener('click', (event) => {
        if (event.target == detailsModal) detailsModal.style.display = 'none';
        if (event.target == rescheduleModal) rescheduleModal.style.display = 'none';
        if (event.target == feedbackModal) feedbackModal.style.display = 'none';
        if (event.target == mapModal) closeMap();
    });

    function formatDeliveryWindow(start, end) {
        const startTime = new Date(start);
        const endTime = new Date(end);
        const day = startTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const timeWindow = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        return `${day}, ${timeWindow}`;
    }

    function openOrderDetailsModal(order) {
        document.getElementById('modal-order-id-display').textContent = order.id;
        document.getElementById('modal-delivery-window').textContent = formatDeliveryWindow(order.delivery_slot_start, order.delivery_slot_end);
        
        const timeline = detailsModal.querySelector('.timeline');
        timeline.innerHTML = '';

        const statusMap = {
            'pending': 'Ordered',
            'cancellation': 'Reschedule Requested',
            'rescheduled': 'Rescheduled by System',
            'assigned': 'Assigned to Agent',
            'in_progress': 'Out for Delivery',
            'failure': 'Delivery Attempt Failed',
            'delay_report': 'Delayed',
            'delivered': 'Delivered',
            'pending_confirmation': 'Awaiting Confirmation',
            'disputed': 'Disputed'
        };

        const allEvents = [{ event_type: 'pending', created_at: order.created_at, reason_code: 'Order Placed' }, ...order.events];
        const sortedEvents = allEvents.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        let lastStepName = null;
        sortedEvents.forEach(event => {
            let eventType = event.event_type;
            if (eventType === 'status_update') eventType = event.reason_code;
            if (eventType === 'delivery') eventType = 'pending_confirmation';
            
            const stepName = statusMap[eventType];

            if (stepName && stepName !== lastStepName) {
                const li = document.createElement('li');
                li.classList.add('completed');
                li.textContent = stepName;
                timeline.appendChild(li);

                if (event.reason_code && !['SUCCESS', 'Order Placed', 'in_progress'].includes(event.reason_code)) {
                    const p = document.createElement('p');
                    p.className = 'delay-reason';
                    p.textContent = `Reason: ${event.reason_code.replace(/_/g, ' ')}`;
                    timeline.appendChild(p);
                }
                lastStepName = stepName;
            }
        });
        
        if (order.status === 'delivered') {
             const li = document.createElement('li');
             li.classList.add('completed');
             li.textContent = 'Delivered';
             timeline.appendChild(li);
        }

        detailsModal.style.display = 'block';
    }

    function openRescheduleModal(orderId) {
        currentOrderId = orderId;
        rescheduleOrderIdSpan.textContent = orderId;
        rescheduleModal.style.display = 'block';
    }

    function openFeedbackModal(orderId) {
        currentOrderId = orderId;
        feedbackOrderIdSpan.textContent = orderId;
        feedbackModal.style.display = 'block';
    }

    function openMapModal(order) {
        currentOrderId = order.id;
        mapOrderIdSpan.textContent = order.id;
        mapModal.style.display = 'block';
        startTracking(accessToken, order);
    }
    
    async function handleActionWithButtonState(button, actionFunction) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Saving...';
        try {
            await actionFunction();
            await loadMyOrders();
        } catch (error) {
            alert(`Action failed: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
    
    async function handleConfirmation(orderId, action, button) {
        await handleActionWithButtonState(button, async () => {
            if (action === 'confirm') {
                await confirmReceipt(accessToken, orderId);
            } else {
                await disputeDelivery(accessToken, orderId);
            }
        });
    }

    confirmRescheduleBtn.addEventListener('click', () => {
        handleActionWithButtonState(confirmRescheduleBtn, async () => {
            const reason = rescheduleReasonSelect.value;
            const details = rescheduleDetailsInput.value;
            await requestReschedule(accessToken, currentOrderId, reason, details);
            alert('Request sent.');
            rescheduleModal.style.display = 'none';
        });
    });
    
    submitFeedbackBtn.addEventListener('click', () => {
        handleActionWithButtonState(submitFeedbackBtn, async () => {
            const rating = ratingSelect.value;
            const feedbackText = feedbackTextInput.value;
            await submitFeedback(accessToken, currentOrderId, rating, feedbackText);
            alert('Feedback submitted!');
            feedbackModal.style.display = 'none';
        });
    });

    function createOrderRow(order) {
        const row = document.createElement('tr');
        row.classList.add('clickable-row');
        row.dataset.orderId = order.id;
        
        const hasCustomerRescheduled = order.events.some(e => e.event_type === 'cancellation');
        
        let actionButtons = `<span class="no-actions-text">N/A</span>`;
        if (order.status === 'delivered') {
            actionButtons = order.rating ? `${order.rating} stars` : `<button class="feedback-btn" data-order-id="${order.id}">Give Feedback</button>`;
        } else if (['pending', 'assigned', 'rescheduled'].includes(order.status) && !hasCustomerRescheduled) {
            actionButtons = `<button class="action-btn delay reschedule-btn" data-order-id="${order.id}">Reschedule</button>`;
        } else if (order.status === 'in_progress' || order.status === 'disputed') {
            actionButtons = `<button class="action-btn track-btn" data-order-id="${order.id}">Track Live</button>`;
        } else if (order.status === 'pending_confirmation') {
             actionButtons = `<div><button class="action-btn approve confirm-btn" data-order-id="${order.id}">✔ Confirm</button> <button class="action-btn failed dispute-btn" data-order-id="${order.id}">✖ Dispute</button></div>`;
        }

        let statusHtml = `<div class="status-cell-content"><span class="status status-${order.status.replace(/_/g, '-')}">${order.status.replace(/_/g, ' ')}</span>`;
        if (order.is_delayed && !['delivered', 'failed'].includes(order.status)) {
            statusHtml += '<span class="delay-indicator">Delayed</span>';
        }
        statusHtml += '</div>';

        row.innerHTML = `
            <td>${order.id}</td>
            <td class="status-cell">${statusHtml}</td>
            <td>${formatDeliveryWindow(order.delivery_slot_start, order.delivery_slot_end)}</td>
            <td>${order.agent ? order.agent.full_name : 'Pending Assignment'}</td>
            <td class="action-cell">${actionButtons}</td>
        `;
        return row;
    }

    async function loadMyOrders() {
        activeTbody.innerHTML = '<tr><td colspan="5" class="loading-state">Loading...</td></tr>';
        historyTbody.innerHTML = '<tr><td colspan="5" class="loading-state">Loading...</td></tr>';
        
        try {
            const freshOrdersData = await fetchCustomerOrders(accessToken);
            ordersData = freshOrdersData;
            
            const activeOrders = ordersData.filter(o => !['delivered', 'failed'].includes(o.status));
            const pastOrders = ordersData.filter(o => ['delivered', 'failed'].includes(o.status));

            activeTbody.innerHTML = '';
            if (activeOrders.length > 0) {
                activeOrders.forEach(order => activeTbody.appendChild(createOrderRow(order)));
            } else {
                activeTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No active orders.</td></tr>';
            }

            historyTbody.innerHTML = '';
            if (pastOrders.length > 0) {
                pastOrders.forEach(order => historyTbody.appendChild(createOrderRow(order)));
            } else {
                historyTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No past orders.</td></tr>';
            }

            createMyOrderStatusChart(ordersData);
            loadAndCreateOrdersByMonthChart();
            
            document.querySelectorAll('.clickable-row').forEach(row => {
                row.addEventListener('click', (event) => {
                    if (event.target.tagName.toLowerCase().includes('button')) return;
                    const order = ordersData.find(o => o.id === parseInt(event.currentTarget.dataset.orderId));
                    if (order) openOrderDetailsModal(order);
                });
            });

            document.querySelectorAll('.reschedule-btn').forEach(button => {
                button.addEventListener('click', (event) => openRescheduleModal(event.target.dataset.orderId));
            });
            document.querySelectorAll('.feedback-btn').forEach(button => {
                button.addEventListener('click', (event) => openFeedbackModal(event.target.dataset.orderId));
            });
            document.querySelectorAll('.track-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    const order = ordersData.find(o => o.id === parseInt(event.target.dataset.orderId));
                    if (order) openMapModal(order);
                });
            });
             document.querySelectorAll('.confirm-btn').forEach(button => {
                button.addEventListener('click', (event) => handleConfirmation(event.target.dataset.orderId, 'confirm', event.target));
            });
            document.querySelectorAll('.dispute-btn').forEach(button => {
                button.addEventListener('click', (event) => handleConfirmation(event.target.dataset.orderId, 'dispute', event.target));
            });
        } catch (error) {
            console.error('Failed to load my orders:', error);
            activeTbody.innerHTML = '<tr><td colspan="5" class="loading-state">Error loading orders.</td></tr>';
            historyTbody.innerHTML = '<tr><td colspan="5" class="loading-state">Error loading orders.</td></tr>';
        }
    }
    
    function createMyOrderStatusChart(orders) {
        const ctx = document.getElementById('myOrderStatusChart').getContext('2d');
        if (!ctx) return;
        
        const chartInstance = Chart.getChart(ctx);
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        const statusCounts = {};
        orders.forEach(order => {
            statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        });
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(statusCounts).map(s => s.replace(/_/g,' ')),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: ['#5cb85c', '#d9534f', '#f0ad4e', '#0275d8', '#5bc0de']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
    
    async function loadAndCreateOrdersByMonthChart() {
        try {
            const data = await fetchCustomerOrdersByMonth(accessToken);
            const ctx = document.getElementById('ordersByMonthChart').getContext('2d');
            const chartContainer = ctx.canvas.parentElement;
            if (!ctx) return;
            
            const chartInstance = Chart.getChart(ctx);
            if (chartInstance) {
                chartInstance.destroy();
            }

            if (data.length === 0) {
                ctx.canvas.style.display = 'none';
                const p = document.createElement('p');
                p.textContent = 'No monthly order data available.';
                chartContainer.appendChild(p);
                return;
            } else {
                 ctx.canvas.style.display = 'block';
                 const existingP = chartContainer.querySelector('p');
                 if(existingP) existingP.remove();
            }

            const labels = data.map(d => d.month);
            const deliveredData = data.map(d => d.statuses.delivered);
            const failedData = data.map(d => d.statuses.failed);
            const rescheduledData = data.map(d => d.statuses.rescheduled);

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Delivered',
                            data: deliveredData,
                            backgroundColor: '#5cb85c',
                        },
                        {
                            label: 'Failed',
                            data: failedData,
                            backgroundColor: '#d9534f',
                        },
                        {
                            label: 'Rescheduled',
                            data: rescheduledData,
                            backgroundColor: '#f0ad4e',
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { stacked: true },
                        y: { stacked: true, beginAtZero: true }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to load monthly analytics', error);
        }
    }

    if (refreshInterval) clearInterval(refreshInterval);
    loadMyOrders();
    refreshInterval = setInterval(loadMyOrders, 10000);
    setupNotifications(accessToken);
});