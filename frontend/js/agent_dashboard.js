let ordersData = [];

document.addEventListener('DOMContentLoaded', () => {
    const accessToken = sessionStorage.getItem('accessToken');
    if (!accessToken) {
        window.location.href = 'login.html';
        return;
    }

    const userInfoDiv = document.getElementById('user-info');
    const logoutBtn = document.getElementById('logout-btn');
    const ordersTableBody = document.querySelector('#orders-table tbody');

    const reasonModal = document.getElementById('reason-modal');
    const closeModalBtn = reasonModal.querySelector('.close-btn');
    const reasonModalTitle = document.getElementById('reason-modal-title');
    const reasonSelect = document.getElementById('reason-select');
    const detailsInput = document.getElementById('details-input');
    const confirmReasonBtn = document.getElementById('confirm-reason-btn');

    let currentAction = {};

    const reasons = {
        delay_report: [
            { code: 'HEAVY_TRAFFIC', text: 'Heavy Traffic' },
            { code: 'ROAD_CLOSURE', text: 'Road Closure / Diversion' },
            { code: 'VEHICLE_BREAKDOWN', text: 'Vehicle Breakdown' },
            { code: 'RESTAURANT_WAREHOUSE_DELAY', text: 'Restaurant/Warehouse Delay' },
            { code: 'INCLEMENT_WEATHER', text: 'Inclement Weather (Rain/Fog)' }
        ],
        failure: [
            { code: 'CUSTOMER_UNAVAILABLE', text: 'Customer Not Available / No Answer' },
            { code: 'UNABLE_TO_LOCATE_ADDRESS', text: 'Unable to Locate Address/GPS Incorrect' },
            { code: 'CUSTOMER_REFUSED', text: 'Customer Refused (Changed Mind)' },
            { code: 'PACKAGE_DAMAGED', text: 'Package Damaged in Transit' },
            { code: 'ACCESS_DENIED', text: 'Access Denied (Security Gate)' }
        ]
    };

    try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        userInfoDiv.textContent = `Logged in as: ${payload.sub}`;
    } catch (e) {
        console.error("Failed to decode token", e);
        window.location.href = 'login.html';
    }

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('accessToken');
        window.location.href = 'login.html';
    });

    closeModalBtn.addEventListener('click', () => {
        reasonModal.style.display = 'none';
    });
    
    window.addEventListener('click', (event) => {
        if (event.target == reasonModal) {
            reasonModal.style.display = 'none';
        }
    });

    function formatDeliveryWindow(start, end) {
        const startTime = new Date(start);
        const endTime = new Date(end);
        const day = startTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const timeWindow = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        return `${day}, ${timeWindow}`;
    }

    function openReasonModal(orderId, eventType) {
        currentAction = { orderId, eventType };
        reasonModalTitle.textContent = `Report ${eventType.replace('_', ' ')}`;
        
        reasonSelect.innerHTML = '';
        const reasonList = reasons[eventType] || [];
        reasonList.forEach(reason => {
            const option = document.createElement('option');
            option.value = reason.code;
            option.textContent = reason.text;
            reasonSelect.appendChild(option);
        });
        
        detailsInput.value = '';
        reasonModal.style.display = 'block';
    }
    
    async function handleActionWithButtonState(button, actionFunction) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Saving...';
        try {
            await actionFunction();
        } catch (error) {
            alert(`Action failed: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    confirmReasonBtn.addEventListener('click', () => {
        handleActionWithButtonState(confirmReasonBtn, async () => {
            const { orderId, eventType } = currentAction;
            const reasonCode = reasonSelect.value;
            const details = detailsInput.value;

            if (!reasonCode) {
                alert('Please select a reason.');
                return;
            }
            await reportAgentEvent(accessToken, orderId, eventType, reasonCode, details);
            reasonModal.style.display = 'none';
            await loadMyOrders();
        });
    });

    async function handleStatusUpdate(orderId, eventType, reasonCode = 'SUCCESS', button) {
         handleActionWithButtonState(button, async () => {
            await reportAgentEvent(accessToken, orderId, eventType, reasonCode);
            await loadMyOrders();
        });
    }
    
    async function loadMyOrders() {
        ordersTableBody.innerHTML = '<tr><td colspan="6" class="loading-state">Loading...</td></tr>';
        try {
            const freshOrdersData = await fetchAgentOrders(accessToken);
            ordersData = freshOrdersData;
            ordersTableBody.innerHTML = '';

            if (ordersData.length === 0) {
                ordersTableBody.innerHTML = '<tr><td colspan="6">You have no assigned orders.</td></tr>';
                return;
            }

            ordersData.forEach(order => {
                const row = document.createElement('tr');
                let actionButtons = `<div><span class="no-actions-text">No actions available</span></div>`;
                
                if (order.status === 'assigned' || order.status === 'rescheduled' || order.status === 'disputed') {
                    actionButtons = `<div><button class="action-btn in-progress" data-order-id="${order.id}">Pick Up</button></div>`;
                } else if (order.status === 'in_progress') {
                    const delayButton = order.is_delayed ? '' : `<button class="action-btn delay" data-order-id="${order.id}">Delay</button>`;
                    actionButtons = `
                        <div>
                            <button class="action-btn delivered" data-order-id="${order.id}">Mark Delivered</button>
                            ${delayButton}
                            <button class="action-btn failed" data-order-id="${order.id}">Fail</button>
                        </div>
                    `;
                }

                let statusHtml = `<div class="status-cell-content"><span class="status status-${order.status.replace('_', '-')}">${order.status.replace('_', ' ')}</span>`;
                if (order.is_delayed && !['delivered', 'failed'].includes(order.status)) {
                    statusHtml += '<span class="delay-indicator">Delayed</span>';
                }
                statusHtml += '</div>';

                row.innerHTML = `
                    <td>${order.id}</td>
                    <td>${order.customer.full_name}</td>
                    <td>${order.delivery_address}</td>
                    <td>${formatDeliveryWindow(order.delivery_slot_start, order.delivery_slot_end)}</td>
                    <td class="status-cell">${statusHtml}</td>
                    <td class="action-cell">${actionButtons}</td>
                `;
                ordersTableBody.appendChild(row);
            });
            
            document.querySelectorAll('.action-btn.in-progress').forEach(button => {
                button.addEventListener('click', (e) => handleStatusUpdate(e.target.dataset.orderId, 'status_update', 'in_progress', e.target));
            });
            document.querySelectorAll('.action-btn.delivered').forEach(button => {
                button.addEventListener('click', (e) => handleStatusUpdate(e.target.dataset.orderId, 'delivery', 'SUCCESS', e.target));
            });
            document.querySelectorAll('.action-btn.delay').forEach(button => {
                button.addEventListener('click', (e) => openReasonModal(e.target.dataset.orderId, 'delay_report'));
            });
            document.querySelectorAll('.action-btn.failed').forEach(button => {
                button.addEventListener('click', (e) => openReasonModal(e.target.dataset.orderId, 'failure'));
            });

        } catch (error) {
            console.error('Failed to load assigned orders:', error);
            ordersTableBody.innerHTML = '<tr><td colspan="6">Error loading orders.</td></tr>';
        }
    }

    loadMyOrders();
    setupNotifications(accessToken);
});