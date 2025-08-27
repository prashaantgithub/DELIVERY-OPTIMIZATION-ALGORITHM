let allOrdersData = [];
let allAgentsData = [];

document.addEventListener('DOMContentLoaded', () => {
    const accessToken = sessionStorage.getItem('accessToken');
    if (!accessToken) {
        window.location.href = 'login.html';
        return;
    }

    const userInfoDiv = document.getElementById('user-info');
    const logoutBtn = document.getElementById('logout-btn');
    const ordersTbody = document.getElementById('orders-tbody');
    const checkDelaysBtn = document.getElementById('check-delays-btn');
    const statusFilter = document.getElementById('status-filter');
    const agentFilter = document.getElementById('agent-filter');
    const assignModal = document.getElementById('assign-modal');
    const detailsModal = document.getElementById('order-details-modal');
    const delayedOrdersModal = document.getElementById('delayed-orders-modal');
    
    const closeAssignModalBtn = assignModal.querySelector('.close-btn');
    const modalOrderIdSpan = document.getElementById('modal-order-id');
    const agentSelect = document.getElementById('agent-select');
    const confirmAssignBtn = document.getElementById('confirm-assign-btn');
    const aiRecommendBtn = document.getElementById('ai-recommend-btn');
    const closeDetailsModalBtn = detailsModal.querySelector('.close-btn');
    const closeDelayedModalBtn = delayedOrdersModal.querySelector('.close-btn');
    const delayedOrdersList = document.getElementById('delayed-orders-list');
    const notifyUsersBtn = document.getElementById('notify-users-btn');
    
    let currentOrderId = null;
    let delayedOrderIds = [];

    try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        userInfoDiv.textContent = `Logged in as: ${payload.sub}`;
    } catch (e) {
        window.location.href = 'login.html';
    }

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('accessToken');
        window.location.href = 'login.html';
    });

    checkDelaysBtn.addEventListener('click', async () => {
        checkDelaysBtn.textContent = 'Checking...';
        checkDelaysBtn.disabled = true;
        try {
            const result = await getSystemDelayedOrders(accessToken);
            delayedOrdersList.innerHTML = '';
            delayedOrderIds = [];
            
            if (result.length === 0) {
                delayedOrdersList.innerHTML = '<li>No delayed orders found.</li>';
                notifyUsersBtn.style.display = 'none';
            } else {
                result.forEach(order => {
                    const li = document.createElement('li');
                    li.textContent = `Order #${order.id} (Agent: ${order.agent.full_name})`;
                    delayedOrdersList.appendChild(li);
                    delayedOrderIds.push(order.id);
                });
                notifyUsersBtn.style.display = 'block';
            }
            delayedOrdersModal.style.display = 'block';
        } catch (error) {
            alert(`Error checking for delays: ${error.message}`);
        }
        checkDelaysBtn.textContent = 'System Health Check';
        checkDelaysBtn.disabled = false;
    });
    
    notifyUsersBtn.addEventListener('click', async () => {
        try {
            const result = await notifySystemDelayed(accessToken, delayedOrderIds);
            alert(`Successfully notified users for ${result.notified_count} orders.`);
            delayedOrdersModal.style.display = 'none';
        } catch (error) {
            alert(`Error sending notifications: ${error.message}`);
        }
    });

    closeAssignModalBtn.addEventListener('click', () => assignModal.style.display = 'none');
    closeDetailsModalBtn.addEventListener('click', () => detailsModal.style.display = 'none');
    closeDelayedModalBtn.addEventListener('click', () => delayedOrdersModal.style.display = 'none');
    
    window.addEventListener('click', (event) => {
        if (event.target == assignModal || event.target == detailsModal || event.target == delayedOrdersModal) {
            assignModal.style.display = 'none';
            detailsModal.style.display = 'none';
            delayedOrdersModal.style.display = 'none';
        }
    });

    aiRecommendBtn.addEventListener('click', async () => {
        try {
            const recommendedAgent = await fetchRecommendedAgent(accessToken, currentOrderId);
            agentSelect.value = recommendedAgent.id;
        } catch (error) {
            alert(`AI Recommendation failed: ${error.message}`);
        }
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
            'pending_confirmation': 'Awaiting Customer Confirmation',
            'disputed': 'Delivery Disputed'
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

        if (order.status === 'delivered' && order.rating) {
            document.getElementById('feedback-display').style.display = 'block';
            document.getElementById('feedback-rating').textContent = `${order.rating} stars`;
            document.getElementById('feedback-comment').textContent = order.feedback_text || 'No comment provided.';
        } else {
            document.getElementById('feedback-display').style.display = 'none';
        }

        detailsModal.style.display = 'block';
    }


    async function loadAgentsIntoModal() {
        try {
            const agents = await fetchAllAgents(accessToken);
            agentSelect.innerHTML = '<option value="">-- Select Agent --</option>';
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = `${agent.full_name} (Score: ${agent.agent_profile.performance_score})`;
                agentSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load agents:', error);
            agentSelect.innerHTML = '<option value="">Error loading agents</option>';
        }
    }

    async function handleAssignClick(orderId) {
        currentOrderId = orderId;
        modalOrderIdSpan.textContent = orderId;
        await loadAgentsIntoModal();
        assignModal.style.display = 'block';
    }
    
    confirmAssignBtn.addEventListener('click', async () => {
        const selectedAgentId = agentSelect.value;
        if (!selectedAgentId) {
            alert('Please select an agent.');
            return;
        }
        
        confirmAssignBtn.textContent = 'Saving...';
        confirmAssignBtn.disabled = true;
        try {
            const response = await assignAgent(accessToken, currentOrderId, selectedAgentId);
            assignModal.style.display = 'none';
            loadAllData();
        } catch (error) {
            console.error('Assignment failed:', error);
            alert(`Assignment failed: ${error.message}`);
        } finally {
            confirmAssignBtn.textContent = 'Confirm Assignment';
            confirmAssignBtn.disabled = false;
        }
    });

    function renderOrders(orders) {
        ordersTbody.innerHTML = ''; 

        if (orders.length === 0) {
            ordersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No orders match the current filters.</td></tr>';
            return;
        }

        orders.forEach(order => {
            const row = document.createElement('tr');
            let actionButtonHTML = `<div class="action-cell"><span class="no-actions-text">N/A</span></div>`;
            
            if(order.status === 'pending') {
                actionButtonHTML = `<div class="action-cell"><button class="assign-btn" data-order-id="${order.id}">Assign</button></div>`;
            } else if (order.status === 'reschedule_requested') {
                actionButtonHTML = `<div class="action-cell"><button class="action-btn approve" data-order-id="${order.id}">Approve Reschedule</button></div>`;
            }
            
            let statusHtml = `<div class="status-cell-content"><span class="status status-${order.status.replace(/_/g, '-')} clickable-status" data-order-id="${order.id}">${order.status.replace(/_/g, ' ')}</span>`;
            if (order.is_delayed && !['delivered', 'failed'].includes(order.status)) {
                statusHtml += '<span class="delay-indicator">Delayed</span>';
            }
            statusHtml += '</div>';
            row.innerHTML = `
                <td>${order.id}</td>
                <td>${order.customer.full_name}</td>
                <td class="status-cell">${statusHtml}</td>
                <td>${order.agent ? order.agent.full_name : 'Not Assigned'}</td>
                <td>${actionButtonHTML}</td>
            `;
            ordersTbody.appendChild(row);
        });

        document.querySelectorAll('.assign-btn').forEach(button => {
            if (!button.disabled) {
                button.addEventListener('click', (event) => handleAssignClick(event.target.getAttribute('data-order-id')));
            }
        });
        document.querySelectorAll('.approve').forEach(button => {
            button.addEventListener('click', (event) => handleApproveClick(event.target.getAttribute('data-order-id')));
        });
        document.querySelectorAll('.clickable-status').forEach(span => {
            span.addEventListener('click', (event) => {
                const orderId = parseInt(event.target.dataset.orderId, 10);
                const order = allOrdersData.find(o => o.id === orderId);
                if (order) openOrderDetailsModal(order);
            });
        });
    }

    async function handleApproveClick(orderId) {
        if (confirm(`Are you sure you want to approve reschedule for Order #${orderId}? The AI will find a new slot.`)) {
            try {
                await approveReschedule(accessToken, orderId);
                alert('Reschedule approved!');
                loadAllData();
            } catch (error) {
                alert(`Failed to approve reschedule: ${error.message}`);
            }
        }
    }
    function applyFilters() {
        let filteredOrders = allOrdersData;
        const statusValue = statusFilter.value;
        const agentValue = agentFilter.value;
        if (statusValue !== 'all') {
            filteredOrders = filteredOrders.filter(o => o.status === statusValue);
        }
        if (agentValue !== 'all') {
            filteredOrders = filteredOrders.filter(o => o.agent && o.agent.id === parseInt(agentValue));
        }
        renderOrders(filteredOrders);
    }
    async function loadAllData() {
        try {
            [allOrdersData, allAgentsData] = await Promise.all([
                fetchAdminData(accessToken, 'orders'),
                fetchAdminData(accessToken, 'agents')
            ]);
            
            agentFilter.innerHTML = '<option value="all">All Agents</option>';
            allAgentsData.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = agent.full_name;
                agentFilter.appendChild(option);
            });
            
            applyFilters();
        } catch (error) {
            console.error('Failed to load initial data:', error);
            ordersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Error loading data.</td></tr>';
        }
    }
    statusFilter.addEventListener('change', applyFilters);
    agentFilter.addEventListener('change', applyFilters);
    loadAllData();
    setupNotifications(accessToken);
});