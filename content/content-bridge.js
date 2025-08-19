
(function() {
  // Inject a page-level script to override geolocation
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/page-script.js');
  (document.head || document.documentElement).prepend(script);
  script.onload = () => {
    script.remove();
    // Send an initial default position to the page script
    window.postMessage({
      type: 'WALKTHELINE_UPDATE_POSITION',
      payload: {
        latitude: 0,
        longitude: 0,
        accuracy: 15
      }
    }, "*");
  };

  // Listen for background updates and forward to page
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.source !== "background") return;
    if (msg.type === "UPDATE_POSITION") {
      const p = msg.position;
      window.postMessage({
        type: 'WALKTHELINE_UPDATE_POSITION',
        payload: {
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy
        }
      }, "*");
    }
    // Add other message types if needed for enable/disable etc.
  });
})();
