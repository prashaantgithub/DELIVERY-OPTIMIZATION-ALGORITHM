document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorMessage.textContent = '';

        const email = loginForm.email.value;
        const password = loginForm.password.value;

        try {
            const data = await loginUser(email, password);
            sessionStorage.setItem('accessToken', data.access_token);
            
            const payload = JSON.parse(atob(data.access_token.split('.')[1]));
            const userRole = payload.role;

            if (userRole === 'admin') {
                window.location.href = 'admin_dashboard.html';
            } else if (userRole === 'agent') {
                window.location.href = 'agent_dashboard.html';
            } else if (userRole === 'customer') {
                window.location.href = 'customer_home.html';
            } else {
                errorMessage.textContent = 'Unknown user role.';
            }

        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });
});