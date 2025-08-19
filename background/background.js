
const enabledTabs = new Set();

// current spoof state per tabId
// { [tabId]: { enabled, position: {lat, lng, accuracy}, watch: {running, timerId, intervalMs, direction, stepMeters}, history: [] } }
const tabState = {};

function metersPerDegreeLat(){
  // degrees latitude per meter = 1 / (111320)
  return 1.0 / 111320.0;
}

function metersPerDegreeLon(lat){
  // degrees longitude per meter depends on latitude
  // meters per degree lon ≈ 111320 * cos(lat)
  const metersPerDegLon = 111320 * Math.cos(lat * Math.PI/180);
  return 1.0 / metersPerDegLon;
}

function moveStep(lat, lon, meters, direction){
  // direction: "N","S","E","W"
  const dLat = meters * metersPerDegreeLat();
  const dLon = meters * metersPerDegreeLon(lat);
  if(direction === "N") return {lat: lat + dLat, lng: lon};
  if(direction === "S") return {lat: lat - dLat, lng: lon};
  if(direction === "E") return {lat: lat, lng: lon + dLon};
  if(direction === "W") return {lat: lat, lng: lon - dLon};
  return {lat, lng: lon};
}

// Receive messages from panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.source === "panel") {
    const tabId = msg.tabId;
    if (msg.type === "ENABLE") {
      enabledTabs.add(tabId);
      if (!tabState[tabId]) tabState[tabId] = {};
      tabState[tabId].enabled = true;
      chrome.tabs.sendMessage(tabId, { source:"background", type:"ENABLE" });
      // If a position is already set for this tab, send an immediate update
      if (tabState[tabId].position) {
        chrome.tabs.sendMessage(tabId, { source:"background", type:"UPDATE_POSITION", position: tabState[tabId].position });
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "DISABLE") {
      enabledTabs.delete(tabId);
      if (!tabState[tabId]) tabState[tabId] = {};
      tabState[tabId].enabled = false;
      // stop any timers
      const w = tabState[tabId].watch;
      if (w && w.timerId) clearInterval(w.timerId);
      tabState[tabId].watch = null;
      chrome.tabs.sendMessage(tabId, { source:"background", type:"DISABLE" });
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "RESET_SYSTEM") {
      // disable and notify page to restore system GPS
      enabledTabs.delete(tabId);
      if (!tabState[tabId]) tabState[tabId] = {};
      tabState[tabId].enabled = false;
      // clear timers
      const w = tabState[tabId].watch;
      if (w && w.timerId) clearInterval(w.timerId);
      tabState[tabId].watch = null;
      chrome.tabs.sendMessage(tabId, { source:"background", type:"RESET_SYSTEM" });
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "SET_POSITION") {
      if (!enabledTabs.has(tabId)) {
        sendResponse({ ok:false, error:"Not enabled for this tab."});
        return true;
      }
      const { lat, lng, accuracy } = msg.position;
      tabState[tabId].position = { lat, lng, accuracy };
      chrome.tabs.sendMessage(tabId, { source:"background", type:"UPDATE_POSITION", position: { latitude: lat, longitude: lng, accuracy: accuracy } });
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "START_WALK") {
      if (!enabledTabs.has(tabId)) { sendResponse({ok:false, error:"Not enabled"}); return true; }
      const { direction, intervalSec, stepMeters } = msg;
      const accuracy = msg.accuracy || 15; // default smartphone-like accuracy
      if (!tabState[tabId].position) { sendResponse({ok:false, error:"No starting position"}); return true; }

      const w = tabState[tabId].watch || {};
      w.running = true;
      w.intervalMs = Math.max(1, intervalSec) * 1000;
      w.direction = direction;
      w.stepMeters = stepMeters;
      w.timerId && clearInterval(w.timerId);
      w.timerId = setInterval(() => {
        const p = tabState[tabId].position;
        const moved = moveStep(p.lat, p.lng, w.stepMeters, w.direction);
        tabState[tabId].position = { lat: moved.lat, lng: moved.lng, accuracy };
        chrome.tabs.sendMessage(tabId, { source:"background", type:"UPDATE_POSITION", position: { latitude: moved.lat, longitude: moved.lng, accuracy: accuracy } });
      }, w.intervalMs);
      tabState[tabId].watch = w;
      sendResponse({ ok:true });
      return true;
    }
    if (msg.type === "STOP_WALK") {
      const w = tabState[tabId]?.watch;
      if (w && w.timerId) clearInterval(w.timerId);
      if (tabState[tabId]) tabState[tabId].watch = null;
      sendResponse({ ok:true });
      return true;
    }
    if (msg.type === "STEP_ONCE") {
      if (!enabledTabs.has(tabId)) { sendResponse({ok:false, error:"Not enabled"}); return true; }
      const { direction, stepMeters, accuracy } = msg;
      if (!tabState[tabId].position) { sendResponse({ok:false, error:"No starting position"}); return true; }
      const p = tabState[tabId].position;
      const moved = moveStep(p.lat, p.lng, stepMeters, direction);
      tabState[tabId].position = { lat: moved.lat, lng: moved.lng, accuracy: accuracy || p.accuracy || 15 };
      chrome.tabs.sendMessage(tabId, { source:"background", type:"UPDATE_POSITION", position: { latitude: moved.lat, longitude: moved.lng, accuracy: accuracy || p.accuracy || 15 } });
      sendResponse({ ok:true });
      return true;
    }
  }
});
