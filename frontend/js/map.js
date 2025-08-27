let map = null;
let agentMarker = null;

const animationStates = {};

const agentIcon = L.icon({
    iconUrl: 'assets/images/scooty_icon.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
});

function stopAnimation(orderId) {
    if (animationStates[orderId] && animationStates[orderId].intervalId) {
        clearInterval(animationStates[orderId].intervalId);
        animationStates[orderId].intervalId = null;
    }
}

function stopAllAnimations() {
    Object.keys(animationStates).forEach(orderId => {
        stopAnimation(orderId);
    });
    if (map) {
        map.remove();
        map = null;
    }
}

async function startTracking(token, order) {
    const mapDiv = document.getElementById('map');
    
    if (map) {
        map.remove();
        map = null;
    }

    map = L.map('map').setView([order.delivery_lat, order.delivery_lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    setTimeout(async () => {
        map.invalidateSize();
        
        let state = animationStates[order.id];

        if (!state || !state.routeCoords) {
            mapDiv.innerHTML = '<div class="loader"></div>';
            try {
                const routeCoords = await getOrderRoute(token, order.id);
                mapDiv.querySelector('.loader').remove();
                
                if (!routeCoords || routeCoords.length < 2) {
                    mapDiv.innerHTML = '<p class="error">Route is too short to display.</p>';
                    return;
                }
                
                state = {
                    routeCoords: routeCoords,
                    currentIndex: 0,
                    isPaused: false,
                    intervalId: null
                };
                animationStates[order.id] = state;
            } catch (error) {
                mapDiv.innerHTML = `<p class="error">Could not load route information. Error: ${error.message}</p>`;
                return;
            }
        }
        
        L.marker(state.routeCoords[0]).addTo(map).bindPopup('Warehouse');
        L.marker(state.routeCoords[state.routeCoords.length - 1]).addTo(map).bindPopup('Your Location');
        L.polyline(state.routeCoords, { color: 'red', weight: 6, opacity: 0.8 }).addTo(map);
        map.fitBounds(L.polyline(state.routeCoords).getBounds());

        agentMarker = L.marker(state.routeCoords[state.currentIndex], { icon: agentIcon }).addTo(map);

        const SIGNAL_STOP_DURATION_MS = 8000;
        const VEHICLE_BREAKDOWN_DURATION_MS = 15000;
        
        const TARGET_ANIMATION_DURATION_S = 45; // Aim for a 30 second journey
        const intervalTime = (TARGET_ANIMATION_DURATION_S * 1000) / state.routeCoords.length;

        stopAnimation(order.id);

        state.intervalId = setInterval(() => {
            const currentOrderData = ordersData.find(o => o.id === order.id);
            const delayEvent = currentOrderData ? currentOrderData.events.find(e => e.event_type === 'delay_report' && e.reason_code !== 'SYSTEM_DETECTED_DELAY') : null;
            
            if (state.isPaused) return;
            
            if (delayEvent) {
                const reasonText = `<b>DELAY:</b> ${delayEvent.reason_code.replace('_', ' ')}`;
                if (delayEvent.reason_code === 'VEHICLE_ISSUE') {
                    state.isPaused = true;
                    agentMarker.bindPopup(reasonText).openPopup();
                    setTimeout(() => {
                        if (state) state.isPaused = false;
                        if(agentMarker) agentMarker.closePopup();
                    }, VEHICLE_BREAKDOWN_DURATION_MS);
                    return;
                } else {
                    if (!agentMarker.isPopupOpen() || agentMarker.getPopup().getContent() !== reasonText) {
                        agentMarker.bindPopup(reasonText).openPopup();
                    }
                }
            } else {
                 if (agentMarker.isPopupOpen() && agentMarker.getPopup().getContent().includes("DELAY")) {
                    agentMarker.closePopup();
                 }
            }

            if (state.currentIndex < state.routeCoords.length - 1) {
                state.currentIndex++;
                agentMarker.setLatLng(state.routeCoords[state.currentIndex]);

                if (Math.random() > 0.95) {
                    state.isPaused = true;
                    agentMarker.bindPopup("Stopped at signal...").openPopup();
                    setTimeout(() => {
                        if (state) state.isPaused = false;
                        if(agentMarker) agentMarker.closePopup();
                    }, SIGNAL_STOP_DURATION_MS);
                }
            } else {
                stopAnimation(order.id);
            }
        }, intervalTime);

    }, 200);
}