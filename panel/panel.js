
const storage = chrome.storage.local;
const FOOT_TO_METER = 0.3048;
const DEFAULT_CENTER = { lat: 33.7756, lng: -84.3963 }; // Example: Atlanta (safe default)
const TILE_SIZE = 256;

function getInspectedTabId(){ return chrome.devtools?.inspectedWindow?.tabId; }
function $(id){ return document.getElementById(id); }
function setStatus(text){ $("status").textContent = text; }

const statusIndicator = $("status-indicator");
const statusHistory = $("status-history");

function updateStatusIndicator(isEnabled) {
  if (isEnabled) {
    statusIndicator.classList.remove("status-indicator-red");
    statusIndicator.classList.add("status-indicator-green");
  } else {
    statusIndicator.classList.remove("status-indicator-green");
    statusIndicator.classList.add("status-indicator-red");
  }
}

function appendStatusToHistory(statusText) {
  const statusEntry = document.createElement("span");
  statusEntry.textContent = statusText;
  statusEntry.classList.add("status-history-entry");
  if (statusHistory.firstChild) {
    statusHistory.insertBefore(statusEntry, statusHistory.firstChild);
  } else {
    statusHistory.appendChild(statusEntry);
  }
  while (statusHistory.children.length > 5) {
    statusHistory.removeChild(statusHistory.lastChild);
  }
}

// ---- Saved locations ----
function loadSaved(){
  storage.get({ savedLocations: [], view: { center: DEFAULT_CENTER, zoom: 15 } }, (res) => {
    const select = $("saved");
    select.innerHTML = "";
    for (const loc of res.savedLocations) {
      const opt = document.createElement("option");
      opt.value = JSON.stringify(loc);
      opt.textContent = `${loc.name} (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})`;
      select.appendChild(opt);
    }
    // init map after storage read
    map.init(res.view.center, res.view.zoom);
  });
}

function saveLocation(){
  const name = $("name").value.trim();
  const lat = parseFloat($("lat").value);
  const lng = parseFloat($("lng").value);
  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) return;
  storage.get({ savedLocations: [] }, (res) => {
    const list = res.savedLocations;
    const idx = list.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
    const entry = { name, lat, lng };
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    storage.set({ savedLocations: list }, loadSaved);
  });
}
function useSelected(){
  const sel = $("saved").value;
  if (!sel) return;
  const loc = JSON.parse(sel);
  $("lat").value = loc.lat;
  $("lng").value = loc.lng;
  map.setMarker({lat: loc.lat, lng: loc.lng}, true);
}
function deleteSelected(){
  const sel = $("saved").value;
  if (!sel) return;
  const loc = JSON.parse(sel);
  storage.get({ savedLocations: [] }, (res) => {
    const list = res.savedLocations.filter(x => x.name !== loc.name);
    storage.set({ savedLocations: list }, loadSaved);
  });
}

function sendToBackground(msg){
  msg.source = "panel";
  msg.tabId = getInspectedTabId();
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}
function setPosition(){
  const lat = parseFloat($("lat").value);
  const lng = parseFloat($("lng").value);
  const acc = parseFloat($("acc").value) || 15;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return;
  return sendToBackground({ type:"SET_POSITION", position: { lat, lng, accuracy: acc } });
}

// ---- Simple Slippy Map (no deps) ----
const map = (() => {
  const canvas = $("map");
  const ctx = canvas.getContext("2d");
  let width=0, height=0, dpr=1;

  // state
  let zoom = 15;
  let center = { ...DEFAULT_CENTER }; // lat,lng
  let marker = null;  // {lat,lng}
  const path = [];    // [{lat,lng}, ...]

  // tile cache
  const cache = new Map(); // key: z/x/y -> HTMLImageElement

  function lat2y(lat){
    const s = Math.sin(lat * Math.PI/180);
    const y = 0.5 - Math.log((1+s)/(1-s)) / (4*Math.PI);
    return y;
  }
  function lng2x(lng){
    return (lng + 180) / 360;
  }
  function x2lng(x){ return x*360 - 180; }
  function y2lat(y){
    const n = Math.PI - 2*Math.PI*y;
    return (180/Math.PI) * Math.atan(0.5*(Math.exp(n) - Math.exp(-n)));
  }

  function project(lat, lng, z){
    const scale = (1 << z) * TILE_SIZE;
    return {
      x: lng2x(lng) * scale,
      y: lat2y(lat) * scale
    };
  }
  function unproject(x, y, z){
    const scale = (1 << z) * TILE_SIZE;
    return {
      lat: y2lat(y/scale),
      lng: x2lng(x/scale)
    };
  }

  function resize(){
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = Math.max(1, Math.floor(rect.width * dpr));
    height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
    render();
  }

  function tileUrl(z, x, y){
    // OSM standard tiles (fair use for debugging)
    const sub = ["a","b","c"][(x+y)%3];
    return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }

  function getTile(z,x,y){
    const key = `${z}/${x}/${y}`;
    if (cache.has(key)) return cache.get(key);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = tileUrl(z,x,y);
    cache.set(key, img);
    return img;
  }

  function render(){
    ctx.save();
    ctx.clearRect(0,0,width,height);
    // BG
    ctx.fillStyle = "#15161a";
    ctx.fillRect(0,0,width,height);

    const centerPx = project(center.lat, center.lng, zoom);
    const topLeftPx = { x: centerPx.x - width/2, y: centerPx.y - height/2 };
    const scale = (1 << zoom) * TILE_SIZE;

    // visible tile range
    const startX = Math.floor(topLeftPx.x / TILE_SIZE);
    const startY = Math.floor(topLeftPx.y / TILE_SIZE);
    const endX = Math.floor((topLeftPx.x + width) / TILE_SIZE);
    const endY = Math.floor((topLeftPx.y + height) / TILE_SIZE);

    for (let ty = startY; ty <= endY; ty++){
      for (let tx = startX; tx <= endX; tx++){
        const img = getTile(zoom, tx, ty);
        const dx = (tx*TILE_SIZE - topLeftPx.x);
        const dy = (ty*TILE_SIZE - topLeftPx.y);
        if (img.complete){
          ctx.drawImage(img, Math.round(dx), Math.round(dy));
        } else {
          img.onload = () => requestAnimationFrame(render);
        }
      }
    }

    // draw path
    if (path.length > 1){
      ctx.lineWidth = Math.max(1, 2*dpr);
      ctx.strokeStyle = "#00ffff";
      ctx.beginPath();
      for (let i=0;i<path.length;i++){
        const p = project(path[i].lat, path[i].lng, zoom);
        const sx = p.x - topLeftPx.x;
        const sy = p.y - topLeftPx.y;
        if (i===0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // draw marker
    if (marker){
      const p = project(marker.lat, marker.lng, zoom);
      const x = p.x - topLeftPx.x;
      const y = p.y - topLeftPx.y;
      const r = Math.max(4, 6*dpr);
      ctx.fillStyle = "#00b4ff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
      // small dot
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, r*0.3, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  // interactions
  let isDragging = false;
  let dragStart = null;
  function onPointerDown(e){
    isDragging = true;
    dragStart = { x: e.clientX * dpr, y: e.clientY * dpr, center: {...center} };
    canvas.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e){
    if (!isDragging) return;
    const dx = e.clientX * dpr - dragStart.x;
    const dy = e.clientY * dpr - dragStart.y;
    // translate pixels in projected space
    const centerPx = project(dragStart.center.lat, dragStart.center.lng, zoom);
    const newCenterPx = { x: centerPx.x - dx, y: centerPx.y - dy };
    center = unproject(newCenterPx.x, newCenterPx.y, zoom);
    render();
  }
  function onPointerUp(e){
    isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
    persistView();
  }
  function onWheel(e){
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const oldZoom = zoom;
    zoom = Math.min(19, Math.max(2, zoom - delta));
    if (zoom !== oldZoom){
      // zoom towards cursor position
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * dpr;
      const cy = (e.clientY - rect.top) * dpr;
      const topLeftOld = (() => {
        const cpx = project(center.lat, center.lng, oldZoom);
        return { x: cpx.x - width/2, y: cpx.y - height/2 };
      })();
      const worldX = topLeftOld.x + cx;
      const worldY = topLeftOld.y + cy;
      const newLatLng = unproject(worldX, worldY, oldZoom);
      const newWorld = project(newLatLng.lat, newLatLng.lng, zoom);
      const newTopLeft = { x: newWorld.x - cx, y: newWorld.y - cy };
      const cNew = unproject(newTopLeft.x + width/2, newTopLeft.y + height/2, zoom);
      center = cNew;
      persistView();
      render();
    }
  }
  function onClick(e){
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;
    const topLeftPx = (() => {
      const cpx = project(center.lat, center.lng, zoom);
      return { x: cpx.x - width/2, y: cpx.y - height/2 };
    })();
    const worldX = topLeftPx.x + px;
    const worldY = topLeftPx.y + py;
    const ll = unproject(worldX, worldY, zoom);
    setMarker(ll, false);
    $("lat").value = ll.lat.toFixed(6);
    $("lng").value = ll.lng.toFixed(6);
  }

  function persistView(){
    storage.set({ view: { center, zoom } });
  }

  function setMarker(ll, recenter){
    marker = { ...ll };
    if (recenter) center = { ...ll };
    render();
  }
  function addPathPoint(ll){
    path.push({ ...ll });
    render();
  }
  function clearPath(){
    path.length = 0;
    render();
  }

  function centerOnMarker(){
    if (!marker) return;
    center = { ...marker };
    render();
  }

  function init(initialCenter, initialZoom){
    center = initialCenter || DEFAULT_CENTER;
    zoom = initialZoom || 15;
    resize();
  }

  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive:false });
  canvas.addEventListener("click", onClick);

  return { init, setMarker, addPathPoint, clearPath, centerOnMarker };
})();

document.addEventListener("DOMContentLoaded", () => {
  loadSaved();
  updateStatusIndicator(false); // Initial state: Disabled
  appendStatusToHistory("Panel Loaded");

  $("enable").addEventListener("click", async () => {
    await sendToBackground({ type: "ENABLE" });
    setStatus("Enabled");
    updateStatusIndicator(true);
    appendStatusToHistory("Enabled");
  });
  $("disable").addEventListener("click", async () => {
    await sendToBackground({ type: "DISABLE" });
    setStatus("Disabled");
    updateStatusIndicator(false);
    appendStatusToHistory("Disabled");
  });
  $("reset").addEventListener("click", async () => {
    await sendToBackground({ type: "RESET_SYSTEM" });
    setStatus("System GPS");
    updateStatusIndicator(false);
    appendStatusToHistory("System GPS");
  });

  $("setpos").addEventListener("click", async () => {
    const res = await setPosition();
    if (res?.ok){
      setStatus("Position set");
      appendStatusToHistory("Position set");
      const lat = parseFloat($("lat").value);
      const lng = parseFloat($("lng").value);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)){
        map.setMarker({lat, lng}, true);
        map.addPathPoint({lat, lng});
      }
    }
  });

  $("save").addEventListener("click", saveLocation);
  $("use_saved").addEventListener("click", useSelected);
  $("delete_saved").addEventListener("click", deleteSelected);

  $("start").addEventListener("click", async () => {
    const dir = $("direction").value;
    const intervalSec = parseInt($("interval").value, 10);
    const stepFt = parseFloat($("stepft").value) || 30;
    const stepMeters = stepFt * FOOT_TO_METER;
    const timeLimitSec = parseInt($("timeLimit").value, 10);
    await sendToBackground({ type:"START_WALK", direction: dir, intervalSec, stepMeters, timeLimitSec });
    const statusText = `Walking ${dir} every ${intervalSec}s`;
    setStatus(statusText);
    appendStatusToHistory(statusText);
  });

  $("stop").addEventListener("click", async () => {
    await sendToBackground({ type:"STOP_WALK" });
    setStatus("Stopped");
    appendStatusToHistory("Stopped");
  });

  $("step").addEventListener("click", async () => {
    const dir = $("direction").value;
    const stepFt = parseFloat($("stepft").value) || 30;
    const stepMeters = stepFt * FOOT_TO_METER;
    const acc = parseFloat($("acc").value) || 15;
    const res = await sendToBackground({ type:"STEP_ONCE", direction: dir, stepMeters, accuracy: acc });
    if (res?.ok){
      setStatus("Stepped once");
      appendStatusToHistory("Stepped once");
    }
  });

  // Map controls
  $("map_center").addEventListener("click", () => map.centerOnMarker());
  $("map_clear_path").addEventListener("click", () => map.clearPath());
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.source === "background" && msg.type === "WALK_STOPPED_AUTO") {
    if (msg.tabId === getInspectedTabId()) {
      setStatus("Stopped (Time Limit)");
      appendStatusToHistory("Stopped (Time Limit)");
    }
  }
});

// Listen to background updates to update map marker/path in panel (via background->content->page->watchPosition
// Note: panel doesn't receive those. We replicate the path by adding on Set/Step clicks.
// For convenience, when the user sets position, we draw it; and when stepping, we cannot know new coords here.
// If you want live path mirroring, we could add a reverse message from background to panel via ports.
