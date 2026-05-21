const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";

const shareCodeEl = document.getElementById("share-code");
const shareStatusEl = document.getElementById("share-status");
const startShareBtn = document.getElementById("start-share");
const cancelShareBtn = document.getElementById("cancel-share");
const copyCodeBtn = document.getElementById("copy-code");

const trackCodeInput = document.getElementById("track-code");
const trackStatusEl = document.getElementById("track-status");
const startTrackBtn = document.getElementById("start-track");
const stopTrackBtn = document.getElementById("stop-track");

const locLat = document.getElementById("loc-lat");
const locLng = document.getElementById("loc-lng");
const locAcc = document.getElementById("loc-acc");
const locTime = document.getElementById("loc-time");
const openMapLink = document.getElementById("open-map");

let activeShareCode = "";
let shareWatchId = null;
let lastLocationPushAt = 0;
let trackPollTimer = null;
let shareStatusShown = false;
let lastTrackSignature = "";
let trackLiveShown = false;
let waitingLocationShown = false;
let lastShareStatusMessage = "";
let lastShareStatusError = false;
let shareHeartbeatTimer = null;
let latestPosition = null;

const normalizeCode = (value) => String(value || "").trim().toUpperCase();

const setShareStatus = (message, isError = false) => {
  if (message === lastShareStatusMessage && isError === lastShareStatusError) {
    return;
  }
  lastShareStatusMessage = message;
  lastShareStatusError = isError;
  shareStatusEl.textContent = message;
  shareStatusEl.style.color = isError ? "#f39da3" : "#87d7b8";
};

const setTrackStatus = (message, isError = false) => {
  trackStatusEl.textContent = message;
  trackStatusEl.style.color = isError ? "#f39da3" : "#87d7b8";
};

const resetTrackedLocationUi = () => {
  locLat.textContent = "-";
  locLng.textContent = "-";
  locAcc.textContent = "-";
  locTime.textContent = "-";
  openMapLink.href = "#";
  lastTrackSignature = "";
  trackLiveShown = false;
  waitingLocationShown = false;
};

const stopShareWatch = () => {
  if (shareWatchId === null) return;
  navigator.geolocation.clearWatch(shareWatchId);
  shareWatchId = null;
};

const stopShareHeartbeat = () => {
  if (!shareHeartbeatTimer) return;
  clearInterval(shareHeartbeatTimer);
  shareHeartbeatTimer = null;
};

const stopTrackingPoll = () => {
  if (!trackPollTimer) return;
  clearInterval(trackPollTimer);
  trackPollTimer = null;
};

const ensureAuthenticated = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (!res.ok) {
      window.location.href = "signin.html";
      return false;
    }
    return true;
  } catch (_) {
    window.location.href = "signin.html";
    return false;
  }
};

const updateShareUi = () => {
  shareCodeEl.textContent = activeShareCode || "------";
};

const pushLocation = async (position) => {
  if (!activeShareCode) return;
  latestPosition = position || latestPosition;
  if (!latestPosition?.coords) return;

  const now = Date.now();
  if (now - lastLocationPushAt < 1200) return;
  lastLocationPushAt = now;

  const { latitude, longitude, accuracy } = latestPosition.coords || {};
  try {
    const res = await fetch(`${API_BASE}/api/gps/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        code: activeShareCode,
        lat: latitude,
        lng: longitude,
        accuracy
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Unable to send location.");
    }
    if (!shareStatusShown) {
      setShareStatus(`Sharing live location. Code: ${activeShareCode}`);
      shareStatusShown = true;
    }
  } catch (error) {
    setShareStatus(error.message || "Unable to send location.", true);
  }
};

const startShareWatch = () => {
  if (!navigator.geolocation) {
    setShareStatus("Geolocation is not supported on this device.", true);
    return;
  }
  if (shareWatchId !== null) return;

  shareWatchId = navigator.geolocation.watchPosition(
    (position) => {
      pushLocation(position);
    },
    (error) => {
      if (error?.code === 1) {
        setShareStatus("Location permission denied.", true);
      } else {
        setShareStatus("Could not read your live location.", true);
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    }
  );

  // Keep sending the last known coordinates continuously even if movement is minimal.
  if (!shareHeartbeatTimer) {
    shareHeartbeatTimer = setInterval(() => {
      if (latestPosition) {
        pushLocation(latestPosition);
      }
    }, 2500);
  }

  // Send first position as soon as possible on start.
  navigator.geolocation.getCurrentPosition(
    (position) => {
      pushLocation(position);
    },
    () => {
      // ignore one-time bootstrap errors
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
};

const startSharing = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/gps/start`, {
      method: "POST",
      credentials: "include"
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not start GPS sharing.");
    }
    const data = await res.json();
    activeShareCode = normalizeCode(data.code);
    shareStatusShown = false;
    lastShareStatusMessage = "";
    lastShareStatusError = false;
    updateShareUi();
    setShareStatus(`Code generated: ${activeShareCode}`);
    startShareWatch();
  } catch (error) {
    setShareStatus(error.message || "Could not start GPS sharing.", true);
  }
};

const cancelSharing = async () => {
  if (!activeShareCode) {
    setShareStatus("Sharing is already off.");
    return;
  }
  try {
    await fetch(`${API_BASE}/api/gps/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code: activeShareCode })
    });
  } catch (_) {
    // ignore transient network issues on cancel
  }
  stopShareWatch();
  stopShareHeartbeat();
  activeShareCode = "";
  shareStatusShown = false;
  lastShareStatusMessage = "";
  lastShareStatusError = false;
  latestPosition = null;
  updateShareUi();
  setShareStatus("Sharing canceled.");
};

const applyTrackedLocation = (location) => {
  if (!location) {
    if (!waitingLocationShown) {
      setTrackStatus("Waiting for first live location update...");
      waitingLocationShown = true;
      locLat.textContent = "-";
      locLng.textContent = "-";
      locAcc.textContent = "-";
      locTime.textContent = "-";
      openMapLink.href = "#";
      lastTrackSignature = "";
      trackLiveShown = false;
    }
    return;
  }
  waitingLocationShown = false;
  const signature = [
    Number(location.lat).toFixed(6),
    Number(location.lng).toFixed(6)
  ].join("|");
  if (signature === lastTrackSignature) {
    return;
  }
  lastTrackSignature = signature;

  locLat.textContent = Number(location.lat).toFixed(6);
  locLng.textContent = Number(location.lng).toFixed(6);
  locAcc.textContent =
    typeof location.accuracy === "number" && Number.isFinite(location.accuracy)
      ? `${Math.round(location.accuracy)} m`
      : "-";
  locTime.textContent = location.updatedAt ? new Date(location.updatedAt).toLocaleString() : "-";
  openMapLink.href = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  if (!trackLiveShown) {
    setTrackStatus("Tracking live location.");
    trackLiveShown = true;
  }
};

const pollTrackingCode = async (code) => {
  try {
    const res = await fetch(`${API_BASE}/api/gps/track/${encodeURIComponent(code)}`, {
      credentials: "include"
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Unable to track this code.");
    }
    const data = await res.json();
    if (!data.active) {
      stopTrackingPoll();
      setTrackStatus("Tracking was canceled by the user.");
      return;
    }
    applyTrackedLocation(data.location || null);
  } catch (error) {
    stopTrackingPoll();
    setTrackStatus(error.message || "Unable to track this code.", true);
  }
};

const startTracking = () => {
  const code = normalizeCode(trackCodeInput.value);
  if (!code) {
    setTrackStatus("Enter a tracking code first.", true);
    return;
  }
  lastTrackSignature = "";
  trackLiveShown = false;
  waitingLocationShown = false;
  trackCodeInput.value = code;
  stopTrackingPoll();
  pollTrackingCode(code);
  trackPollTimer = setInterval(() => {
    pollTrackingCode(code);
  }, 2000);
};

const loadActiveShareSession = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/gps/my-active`, {
      credentials: "include"
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.active || !data.code) return;
    activeShareCode = normalizeCode(data.code);
    shareStatusShown = false;
    lastShareStatusMessage = "";
    lastShareStatusError = false;
    updateShareUi();
    setShareStatus(`Resumed active code: ${activeShareCode}`);
    startShareWatch();
  } catch (_) {
    // ignore on load
  }
};

startShareBtn.addEventListener("click", startSharing);
cancelShareBtn.addEventListener("click", cancelSharing);
copyCodeBtn.addEventListener("click", async () => {
  if (!activeShareCode) {
    setShareStatus("No active code to copy.", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(activeShareCode);
    setShareStatus(`Copied code: ${activeShareCode}`);
  } catch (_) {
    setShareStatus("Could not copy code.", true);
  }
});

startTrackBtn.addEventListener("click", startTracking);
stopTrackBtn.addEventListener("click", () => {
  stopTrackingPoll();
  resetTrackedLocationUi();
  setTrackStatus("Tracking stopped.");
});

window.addEventListener("beforeunload", () => {
  stopTrackingPoll();
  stopShareWatch();
  stopShareHeartbeat();
});

const init = async () => {
  const ok = await ensureAuthenticated();
  if (!ok) return;
  resetTrackedLocationUi();
  updateShareUi();
  await loadActiveShareSession();
};

init();
