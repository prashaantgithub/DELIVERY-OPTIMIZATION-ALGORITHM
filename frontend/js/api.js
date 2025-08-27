const API_BASE_URL = 'http://127.0.0.1:8000/api';

async function loginUser(email, password) {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
    }

    const data = await response.json();
    return data;
}

async function fetchApiData(token, role, endpoint) {
    const response = await fetch(`${API_BASE_URL}/${role}/${endpoint}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (response.status === 401) {
        sessionStorage.removeItem('accessToken');
        window.location.href = 'login.html';
        throw new Error('Session expired. Please log in again.');
    }
    
    if (!response.ok) {
        throw new Error(`Failed to fetch ${endpoint}`);
    }

    return await response.json();
}

async function postApiData(token, role, endpoint, body) {
    const response = await fetch(`${API_BASE_URL}/${role}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : null,
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 202) {
            alert(errorData.detail);
            return { special_case: 'ai_rescheduled' };
        }
        throw new Error(errorData.detail || `POST request to ${endpoint} failed`);
    }

    return await response.json();
}

async function fetchAdminData(token, endpoint) {
    return await fetchApiData(token, 'admin', endpoint);
}

async function fetchAdminAnalytics(token) {
    return await fetchAdminData(token, 'analytics');
}

async function fetchAllAgents(token) {
    return await fetchAdminData(token, 'agents');
}

async function fetchRecommendedAgent(token, orderId) {
    return await fetchAdminData(token, `orders/${orderId}/recommend-agent`);
}

async function assignAgent(token, orderId, agentId) {
    return await postApiData(token, 'admin', `orders/${orderId}/assign-agent?agent_id=${agentId}`);
}

async function approveReschedule(token, orderId) {
    return await postApiData(token, 'admin', `orders/${orderId}/approve-reschedule`);
}

async function fetchAgentOrders(token) {
    return await fetchApiData(token, 'agent', 'me/orders');
}

async function fetchAgentAnalytics(token) {
    return await fetchApiData(token, 'agent', 'me/analytics');
}

async function reportAgentEvent(token, orderId, eventType, reasonCode, details) {
    const endpoint = `orders/${orderId}/report-event?event_type=${eventType}&reason_code=${reasonCode}`;
    const fullEndpoint = details ? `${endpoint}&details=${encodeURIComponent(details)}` : endpoint;
    return await postApiData(token, 'agent', fullEndpoint);
}

async function fetchCustomerOrders(token) {
    return await fetchApiData(token, 'customer', 'me/orders');
}

async function fetchCustomerOrdersByMonth(token) {
    return await fetchApiData(token, 'customer', 'me/analytics/orders-by-month');
}

async function getOrderRoute(token, orderId) {
    return await fetchApiData(token, 'customer', `orders/${orderId}/route`);
}

async function submitFeedback(token, orderId, rating, feedbackText) {
    const endpoint = `orders/${orderId}/feedback?rating=${rating}`;
    const fullEndpoint = feedbackText ? `${endpoint}&feedback_text=${encodeURIComponent(feedbackText)}` : endpoint;
    return await postApiData(token, 'customer', fullEndpoint);
}

async function confirmReceipt(token, orderId) {
    return await postApiData(token, 'customer', `orders/${orderId}/confirm`);
}

async function disputeDelivery(token, orderId) {
    return await postApiData(token, 'customer', `orders/${orderId}/dispute`);
}

async function fetchRecommendedSlots(token) {
    return await fetchApiData(token, 'ai', 'recommend-slots');
}

async function createOrder(token, orderData) {
    return await postApiData(token, 'customer', 'orders', orderData);
}

async function requestReschedule(token, orderId, reason, details) {
    const endpoint = `orders/${orderId}/request-reschedule?reason=${reason}`;
    const fullEndpoint = details ? `${endpoint}&details=${encodeURIComponent(details)}` : endpoint;
    return await postApiData(token, 'customer', fullEndpoint);
}

async function getSystemDelayedOrders(token) {
    return await fetchAdminData(token, 'system/delayed-orders');
}

async function notifySystemDelayed(token, orderIds) {
    return await postApiData(token, 'admin', 'system/notify-delayed', orderIds);
}