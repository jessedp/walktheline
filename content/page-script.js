
(function() {
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
        successCallback(currentPosition);
    }

    function watchPosition(successCallback, errorCallback, options) {
        const watchId = nextWatchId++;
        watchers.set(watchId, successCallback);
        successCallback(currentPosition);
        return watchId;
    }

    function clearWatch(watchId) {
        watchers.delete(watchId);
    }

    // Store original Geolocation object
    const originalGeolocation = navigator.geolocation;

    // Create a proxy handler
    const geolocationProxyHandler = {
        get(target, prop, receiver) {
            if (prop === 'getCurrentPosition') {
                return getCurrentPosition;
            }
            if (prop === 'watchPosition') {
                return watchPosition;
            }
            if (prop === 'clearWatch') {
                return clearWatch;
            }
            // Fallback to the original property for anything else
            return Reflect.get(target, prop, receiver);
        }
    };

    // Create the proxy
    const geolocationProxy = new Proxy(originalGeolocation, geolocationProxyHandler);

    // Replace navigator.geolocation with the proxy
    Object.defineProperty(navigator, 'geolocation', {
        value: geolocationProxy,
        writable: false,
        configurable: true
    });

    console.log('WalkTheLine: navigator.geolocation overridden with Proxy');

    

    // Listen for messages from the content script to update the position
    window.addEventListener('message', (event) => {
        if (event.source === window && event.data.type === 'WALKTHELINE_UPDATE_POSITION') {
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
