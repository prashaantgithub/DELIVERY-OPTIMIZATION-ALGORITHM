document.addEventListener('DOMContentLoaded', () => {
    const accessToken = sessionStorage.getItem('accessToken');
    if (!accessToken) {
        window.location.href = 'login.html';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    const buyButtons = document.querySelectorAll('.buy-btn');
    const slotModal = document.getElementById('slot-modal');
    const closeModalBtn = slotModal.querySelector('.close-btn');
    const slotOptionsDiv = document.getElementById('slot-options');
    const confirmOrderBtn = document.getElementById('confirm-order-btn');

    let selectedSlot = null;
    let currentProductId = null;

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('accessToken');
        window.location.href = 'login.html';
    });
    
    closeModalBtn.addEventListener('click', () => {
        slotModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == slotModal) {
            slotModal.style.display = 'none';
        }
    });

    buyButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            currentProductId = event.target.dataset.productId;
            slotModal.style.display = 'block';
            slotOptionsDiv.innerHTML = '<div class="loader"></div>';
            confirmOrderBtn.style.display = 'none';
            selectedSlot = null;

            try {
                const recommendedSlots = await fetchRecommendedSlots(accessToken);
                renderSlots(recommendedSlots);
            } catch (error) {
                console.error("Failed to fetch slots:", error);
                slotOptionsDiv.innerHTML = `<p class="error">Could not load delivery slots. ${error.message}</p>`;
            }
        });
    });

    function renderSlots(slots) {
        slotOptionsDiv.innerHTML = '';
        if (slots.length === 0) {
            slotOptionsDiv.innerHTML = '<p>No available slots found. Please try again later.</p>';
            return;
        }

        slots.forEach((slot) => {
            const startTime = new Date(slot.start);
            const endTime = new Date(slot.end);

            const day = startTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
            const timeWindow = `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

            const slotEl = document.createElement('div');
            slotEl.classList.add('slot-option');
            if (slot.is_recommended) {
                slotEl.classList.add('recommended');
            }
            slotEl.innerHTML = `
                <strong>${day}</strong><br>
                <span>${timeWindow}</span>
                ${slot.is_recommended ? '<span class="rec-badge">🏆 Recommended</span>' : ''}
            `;
            slotEl.addEventListener('click', () => {
                document.querySelectorAll('.slot-option').forEach(el => el.classList.remove('selected'));
                slotEl.classList.add('selected');
                selectedSlot = slot;
                confirmOrderBtn.style.display = 'block';
            });
            slotOptionsDiv.appendChild(slotEl);
        });
    }
    
    confirmOrderBtn.addEventListener('click', async () => {
        if (!selectedSlot) {
            alert('Please select a slot before confirming.');
            return;
        }

        const orderData = {
            delivery_address: "Koramangala, Bengaluru, Karnataka",
            delivery_lat: 12.9357,
            delivery_lon: 77.6245,
            delivery_slot_start: selectedSlot.start,
            delivery_slot_end: selectedSlot.end
        };

        try {
            const newOrder = await createOrder(accessToken, orderData);
            alert(`Successfully created Order #${newOrder.id}!`);
            slotModal.style.display = 'none';
        } catch (error) {
            console.error('Failed to create order:', error);
            alert('There was an error creating your order. Please try again.');
        }
    });

    setupNotifications(accessToken);
});