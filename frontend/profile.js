const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";
const AVATAR_KEY = "userAvatarImage";
const TRIP_HISTORY_KEY = "userTripHistory";

const profileName = document.getElementById("profile-name");
const profileAvatar = document.getElementById("profile-avatar");
const avatarEditBtn = document.getElementById("avatar-edit-btn");
const avatarUpload = document.getElementById("avatar-upload");
const cropModal = document.getElementById("crop-modal");
const cropCanvas = document.getElementById("crop-canvas");
const cropZoom = document.getElementById("crop-zoom");
const cropCancel = document.getElementById("crop-cancel");
const cropApply = document.getElementById("crop-apply");
const profileTripHistory = document.getElementById("profile-trip-history");

const cropState = {
  image: null,
  scale: 1,
  minScale: 1,
  maxScale: 4,
  x: 0,
  y: 0,
  dragging: false,
  lastX: 0,
  lastY: 0
};

const ensureAuthenticated = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (!res.ok) {
      localStorage.removeItem("userProfile");
      window.location.href = "signin.html";
      return null;
    }
    const user = await res.json();
    localStorage.setItem("userProfile", JSON.stringify(user));
    return user;
  } catch (_) {
    const cached = localStorage.getItem("userProfile");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {
        return {};
      }
    }
    return {};
  }
};

const applyUser = (user) => {
  const email = user?.email || "";
  const display =
    (user?.name && String(user.name).trim()) ||
    (email ? email.split("@")[0] : "User");
  const upperName = String(display).toUpperCase();

  if (profileName) profileName.textContent = upperName;
  if (profileAvatar) profileAvatar.textContent = upperName.charAt(0) || "U";
};

const applyAvatarImage = (src) => {
  if (!profileAvatar) return;
  profileAvatar.style.backgroundImage = src ? `url("${src}")` : "";
  profileAvatar.classList.toggle("has-image", Boolean(src));
};

const clampCropPosition = () => {
  if (!cropState.image || !cropCanvas) return;
  const cw = cropCanvas.width;
  const ch = cropCanvas.height;
  const dw = cropState.image.width * cropState.scale;
  const dh = cropState.image.height * cropState.scale;

  if (dw <= cw) {
    cropState.x = (cw - dw) / 2;
  } else {
    const minX = cw - dw;
    cropState.x = Math.max(minX, Math.min(0, cropState.x));
  }

  if (dh <= ch) {
    cropState.y = (ch - dh) / 2;
  } else {
    const minY = ch - dh;
    cropState.y = Math.max(minY, Math.min(0, cropState.y));
  }
};

const drawCropCanvas = () => {
  if (!cropCanvas || !cropState.image) return;
  const ctx = cropCanvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  ctx.drawImage(
    cropState.image,
    cropState.x,
    cropState.y,
    cropState.image.width * cropState.scale,
    cropState.image.height * cropState.scale
  );
};

const openCropModal = () => {
  if (!cropModal) return;
  cropModal.classList.remove("hidden");
  cropModal.setAttribute("aria-hidden", "false");
};

const closeCropModal = () => {
  if (!cropModal) return;
  cropModal.classList.add("hidden");
  cropModal.setAttribute("aria-hidden", "true");
  cropState.dragging = false;
  cropCanvas?.classList.remove("dragging");
};

const getPointerPosition = (event) => {
  if (!cropCanvas) return { x: 0, y: 0 };
  const rect = cropCanvas.getBoundingClientRect();
  let clientX = 0;
  let clientY = 0;
  if ("touches" in event && event.touches.length) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if ("changedTouches" in event && event.changedTouches.length) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }
  return { x: clientX - rect.left, y: clientY - rect.top };
};

const loadCropImage = (dataUrl) => {
  const img = new Image();
  img.onload = () => {
    if (!cropCanvas || !cropZoom) return;
    cropState.image = img;
    cropState.minScale = Math.max(cropCanvas.width / img.width, cropCanvas.height / img.height);
    cropState.maxScale = cropState.minScale * 4;
    cropState.scale = cropState.minScale;
    cropZoom.value = "100";
    cropState.x = (cropCanvas.width - img.width * cropState.scale) / 2;
    cropState.y = (cropCanvas.height - img.height * cropState.scale) / 2;
    clampCropPosition();
    drawCropCanvas();
    openCropModal();
  };
  img.src = dataUrl;
};

const getCroppedAvatarDataUrl = () => {
  if (!cropState.image || !cropCanvas) return "";
  const outputSize = 320;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outputSize;
  outCanvas.height = outputSize;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) return "";

  ctx.save();
  ctx.beginPath();
  ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const ratio = outputSize / cropCanvas.width;
  ctx.drawImage(
    cropState.image,
    cropState.x * ratio,
    cropState.y * ratio,
    cropState.image.width * cropState.scale * ratio,
    cropState.image.height * cropState.scale * ratio
  );
  ctx.restore();

  return outCanvas.toDataURL("image/png");
};

const setupAvatarUpload = () => {
  if (!avatarUpload || !cropCanvas || !cropZoom) return;

  const saved = localStorage.getItem(AVATAR_KEY);
  if (saved) applyAvatarImage(saved);

  avatarEditBtn?.addEventListener("click", () => {
    avatarUpload.click();
  });

  avatarUpload.addEventListener("change", () => {
    const file = avatarUpload.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      loadCropImage(dataUrl);
    };
    reader.readAsDataURL(file);
  });

  cropZoom.addEventListener("input", () => {
    if (!cropState.image || !cropCanvas) return;
    const prevScale = cropState.scale;
    const zoomFactor = Number(cropZoom.value) / 100;
    cropState.scale = cropState.minScale * zoomFactor;
    cropState.scale = Math.max(cropState.minScale, Math.min(cropState.maxScale, cropState.scale));

    const cx = cropCanvas.width / 2;
    const cy = cropCanvas.height / 2;
    const relX = (cx - cropState.x) / prevScale;
    const relY = (cy - cropState.y) / prevScale;
    cropState.x = cx - relX * cropState.scale;
    cropState.y = cy - relY * cropState.scale;

    clampCropPosition();
    drawCropCanvas();
  });

  const startDrag = (event) => {
    if (!cropState.image) return;
    event.preventDefault();
    const pos = getPointerPosition(event);
    cropState.dragging = true;
    cropState.lastX = pos.x;
    cropState.lastY = pos.y;
    cropCanvas.classList.add("dragging");
  };

  const moveDrag = (event) => {
    if (!cropState.dragging || !cropState.image) return;
    event.preventDefault();
    const pos = getPointerPosition(event);
    const dx = pos.x - cropState.lastX;
    const dy = pos.y - cropState.lastY;
    cropState.lastX = pos.x;
    cropState.lastY = pos.y;
    cropState.x += dx;
    cropState.y += dy;
    clampCropPosition();
    drawCropCanvas();
  };

  const endDrag = () => {
    cropState.dragging = false;
    cropCanvas.classList.remove("dragging");
  };

  cropCanvas.addEventListener("mousedown", startDrag);
  cropCanvas.addEventListener("touchstart", startDrag, { passive: false });
  window.addEventListener("mousemove", moveDrag, { passive: false });
  window.addEventListener("touchmove", moveDrag, { passive: false });
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchend", endDrag);
  window.addEventListener("touchcancel", endDrag);

  cropCancel?.addEventListener("click", () => {
    closeCropModal();
    avatarUpload.value = "";
  });

  cropApply?.addEventListener("click", () => {
    const dataUrl = getCroppedAvatarDataUrl();
    if (!dataUrl) return;
    localStorage.setItem(AVATAR_KEY, dataUrl);
    applyAvatarImage(dataUrl);
    closeCropModal();
    avatarUpload.value = "";
  });

  cropModal?.addEventListener("click", (event) => {
    if (event.target === cropModal) closeCropModal();
  });
};

const renderTripHistory = () => {
  if (!profileTripHistory) return;
  const saved = localStorage.getItem(TRIP_HISTORY_KEY);
  let trips = [];

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) trips = parsed;
    } catch (_) {
      trips = [];
    }
  }

  if (!trips.length) {
    profileTripHistory.innerHTML = `<p class="history-empty">No trip history yet. Plan a trip to see it here.</p>`;
    return;
  }

  const formatDate = (isoDate) => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  profileTripHistory.innerHTML = trips
    .slice(0, 5)
    .map(
      (trip) => `
        <article class="history-item">
          <h3>${trip.from || "-"} to ${trip.destination || "-"}</h3>
          <p>${trip.days || "-"} day(s) · ${trip.persons || "-"} traveler(s) · ${trip.tripType || "-"}</p>
          <span>${formatDate(trip.plannedAt)}</span>
        </article>
      `
    )
    .join("");
};

window.addEventListener("load", async () => {
  const user = await ensureAuthenticated();
  if (!user) return;
  applyUser(user);
  setupAvatarUpload();
  renderTripHistory();
});
