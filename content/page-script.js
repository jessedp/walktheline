
(function() {
    const originalGeolocation = navigator.geolocation;
    let currentPosition = {
        coords: {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null
        },
        timestamp: Date.now()
    };

    const watchers = new Map();
    let nextWatchId = 1;

    function getCurrentPosition(successCallback, errorCallback, options) {
        console.log('WalkTheLine: getCurrentPosition called');
        successCallback(currentPosition);
    }

    function watchPosition(successCallback, errorCallback, options) {
        console.log('WalkTheLine: watchPosition called');
        const watchId = nextWatchId++;
        watchers.set(watchId, successCallback);
        successCallback(currentPosition);
        return watchId;
    }

    function clearWatch(watchId) {
        console.log('WalkTheLine: clearWatch called', watchId);
        watchers.delete(watchId);
    }

    Object.defineProperty(navigator, 'geolocation', {
        value: {
            getCurrentPosition: getCurrentPosition,
            watchPosition: watchPosition,
            clearWatch: clearWatch
        },
        writable: false,
        configurable: true
    });

    console.log('WalkTheLine: navigator.geolocation overridden');

    // Listen for messages from the content script to update the position
    window.addEventListener('message', (event) => {
        if (event.source === window && event.data.type === 'WALKTHELINE_UPDATE_POSITION') {
            console.log('WalkTheLine: Received update position message', event.data.payload);
            currentPosition = {
                coords: {
                    latitude: event.data.payload.latitude,
                    longitude: event.data.payload.longitude,
                    accuracy: event.data.payload.accuracy || 0,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null
                },
                timestamp: Date.now()
            };

            // Notify all active watchers of the new position
            for (const callback of watchers.values()) {
                try {
                    callback(currentPosition);
                } catch (e) {
                    console.error("WalkTheLine: Error in watchPosition callback:", e);
                }
            }
        }
    });
})();
