const API_BASE_URL_NOTIF = 'http://127.0.0.1:8000/api';

async function fetchApiDataNotif(token, role, endpoint) {
    const response = await fetch(`${API_BASE_URL_NOTIF}/${role}/${endpoint}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });
    if (!response.ok) throw new Error('Network response was not ok.');
    return await response.json();
}

async function postApiDataNotif(token, role, endpoint, body) {
    const response = await fetch(`${API_BASE_URL_NOTIF}/${role}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : null,
    });
    if (!response.ok) throw new Error('Network response was not ok.');
    return await response.json();
}

async function fetchNotifications(token) {
    return await fetchApiDataNotif(token, 'auth', 'notifications');
}

async function markNotificationRead(token, notificationId) {
    return await postApiDataNotif(token, 'auth', `notifications/${notificationId}/read`);
}

function setupNotifications(token) {
    const bellContainer = document.querySelector('.notification-bell');
    if (!bellContainer) return;

    const countBadge = bellContainer.querySelector('.notification-count');
    const panel = bellContainer.querySelector('.notification-panel');
    
    if (!countBadge || !panel) return;

    const loadNotifications = async () => {
        try {
            const notifications = await fetchNotifications(token);
            panel.innerHTML = '';
            
            const unreadCount = notifications.filter(n => !n.is_read).length;
            countBadge.textContent = unreadCount;
            countBadge.style.display = unreadCount > 0 ? 'block' : 'none';

            if (notifications.length === 0) {
                panel.innerHTML = '<div class="notification-item">No new notifications</div>';
                return;
            }

            notifications.forEach(n => {
                const item = document.createElement('div');
                item.classList.add('notification-item');
                if (!n.is_read) {
                    item.classList.add('unread');
                }
                item.textContent = n.message;
                
                item.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!n.is_read) {
                        await markNotificationRead(token, n.id);
                        loadNotifications();
                    }
                });
                
                panel.appendChild(item);
            });

        } catch (error) {
            console.error('Failed to load notifications', error);
            panel.innerHTML = '<div class="notification-item">Error loading notifications</div>';
        }
    };

    bellContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            loadNotifications();
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!bellContainer.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    loadNotifications();
    setInterval(loadNotifications, 15000);
}