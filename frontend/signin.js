const form = document.getElementById("signin-form");
const statusEl = document.getElementById("signin-status");
const inputs = document.querySelectorAll(".input-wrap");
const signInBtn = document.querySelector(".signin-btn");
const socialButtons = document.querySelectorAll(".social-btn");
const card = document.getElementById("signin-card");
const sparkleLayer = document.getElementById("sparkle-layer");
const pinLayer = document.getElementById("signin-pin-layer");
const robotCheck = document.getElementById("signin-robot");
const forgotBtn = document.getElementById("forgot-btn");
const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";
const providerUrls = {
  google: "https://accounts.google.com/",
  facebook: "https://www.facebook.com/login/"
};

const spawnSparkle = (x, y) => {
  if (!sparkleLayer) return;
  const sparkle = document.createElement("span");
  sparkle.className = "sparkle";
  sparkle.style.left = `${x}px`;
  sparkle.style.top = `${y}px`;
  sparkle.style.setProperty("--dx", `${(Math.random() - 0.5) * 80}px`);
  sparkle.style.setProperty("--dy", `${(Math.random() - 0.5) * 80}px`);
  sparkleLayer.appendChild(sparkle);
  setTimeout(() => sparkle.remove(), 1200);
};

const initPasswordToggles = () => {
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    const input = btn.parentElement?.querySelector("input");
    if (!input) return;
    btn.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
      btn.classList.toggle("is-visible", isPassword);
    });
  });
};

let captureVerified = false;
let captureActive = false;
let cursorEl = null;
let draggingCapture = false;
const CURSOR_SIZE = 26;

const spawnPins = () => {
  if (!pinLayer || !card) return;
  pinLayer.innerHTML = "";
  captureVerified = false;
  captureActive = true;
  if (cursorEl) {
    cursorEl.remove();
    cursorEl = null;
  }
  if (robotCheck) {
    robotCheck.checked = false;
  }
  pinLayer.classList.add("capture-active");
  document.body.classList.add("capture-cursor-active");
  ensureCursor();
  if (statusEl) {
    statusEl.textContent = "Collect all the stars to verify.";
  }
  const planes = 16;
  const layerRect = pinLayer.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const pad = 36;

  const safeRect = {
    left: cardRect.left - pad,
    right: cardRect.right + pad,
    top: cardRect.top - pad,
    bottom: cardRect.bottom + pad
  };

  const pickPointOutside = () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const x = Math.random() * layerRect.width;
      const y = Math.random() * layerRect.height;
      const absX = layerRect.left + x;
      const absY = layerRect.top + y;
      const inside =
        absX > safeRect.left &&
        absX < safeRect.right &&
        absY > safeRect.top &&
        absY < safeRect.bottom;
      if (!inside) {
        return { x, y };
      }
    }
    return { x: Math.random() * layerRect.width, y: Math.random() * layerRect.height };
  };

  const centerX = cardRect.left + cardRect.width / 2;
  const centerY = cardRect.top + cardRect.height / 2;

  for (let i = 0; i < planes; i += 1) {
    const plane = document.createElement("span");
    plane.className = "plane";
    const { x, y } = pickPointOutside();
    const delay = Math.random() * 6;
    const duration = 6 + Math.random() * 6;
    const scale = 0.7 + Math.random() * 0.9;
    const absX = layerRect.left + x;
    const absY = layerRect.top + y;
    const vecX = absX - centerX;
    const vecY = absY - centerY;
    const len = Math.hypot(vecX, vecY) || 1;
    const nx = vecX / len;
    const ny = vecY / len;

    const edgeMargin = 18;
    const maxDx = Math.min(
      absX - layerRect.left - edgeMargin,
      layerRect.right - edgeMargin - absX
    );
    const maxDy = Math.min(
      absY - layerRect.top - edgeMargin,
      layerRect.bottom - edgeMargin - absY
    );

    const distX =
      absX < safeRect.left ? safeRect.left - absX :
      absX > safeRect.right ? absX - safeRect.right : 0;
    const distY =
      absY < safeRect.top ? safeRect.top - absY :
      absY > safeRect.bottom ? absY - safeRect.bottom : 0;
    const minDist = Math.max(20, Math.hypot(distX, distY));
    const maxDrift = Math.min(180, minDist + 120);
    const mag = 40 + Math.random() * (maxDrift - 40);
    const sideJitter = (Math.random() - 0.5) * 20;
    let dx = nx * mag + -ny * sideJitter;
    let dy = ny * mag + nx * sideJitter;

    dx = Math.max(-maxDx, Math.min(maxDx, dx));
    dy = Math.max(-maxDy, Math.min(maxDy, dy));
    const rot = -18 + Math.random() * 36;
    plane.style.left = `${x}px`;
    plane.style.top = `${y}px`;
    plane.style.animationDelay = `${delay}s`;
    plane.style.animationDuration = `${duration}s`;
    plane.style.transform = `translate(-50%, -50%) scale(${scale})`;
    plane.style.setProperty("--dx", `${dx}px`);
    plane.style.setProperty("--dy", `${dy}px`);
    plane.style.setProperty("--rot", `${rot}deg`);
    pinLayer.appendChild(plane);
  }
};

inputs.forEach((wrap) => {
  const input = wrap.querySelector("input");
  input.addEventListener("focus", () => wrap.classList.add("active"));
  input.addEventListener("blur", () => wrap.classList.remove("active"));
  wrap.addEventListener("click", (event) => {
    wrap.classList.remove("click-animate");
    void wrap.offsetWidth;
    wrap.classList.add("click-animate");
    const rect = wrap.getBoundingClientRect();
    spawnSparkle(event.clientX - rect.left + rect.left, event.clientY - rect.top + rect.top);
  });
});

signInBtn.addEventListener("click", (event) => {
  signInBtn.classList.add("clicked");
  setTimeout(() => signInBtn.classList.remove("clicked"), 700);
  spawnSparkle(event.clientX, event.clientY);
});

socialButtons.forEach((btn) => {
  btn.addEventListener("click", (event) => {
    spawnSparkle(event.clientX, event.clientY);
    const provider = String(btn.dataset.provider || "").trim().toLowerCase();
    const providerUrl = providerUrls[provider];
    if (providerUrl) {
      statusEl.textContent = `Opening ${btn.dataset.provider} sign-in...`;
      window.open(providerUrl, "_blank", "noopener,noreferrer");
      return;
    }
    statusEl.textContent = `${btn.dataset.provider} login coming soon.`;
  });
});

card.addEventListener("mousemove", (event) => {
  const rect = card.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const rotateX = ((y / rect.height) - 0.5) * -8;
  const rotateY = ((x / rect.width) - 0.5) * 10;
  card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
});

card.addEventListener("mouseleave", () => {
  card.style.transform = "rotateX(0deg) rotateY(0deg)";
});

const ensureCursor = () => {
  if (!pinLayer) return;
  if (!cursorEl) {
    cursorEl = document.createElement("div");
    cursorEl.className = "capture-cursor";
    pinLayer.appendChild(cursorEl);
  }
};

const updateCursor = (x, y) => {
  if (!cursorEl || !pinLayer) return;
  const layerRect = pinLayer.getBoundingClientRect();
  const left = x - layerRect.left - CURSOR_SIZE / 2;
  const top = y - layerRect.top - CURSOR_SIZE / 2;
  cursorEl.style.left = `${left}px`;
  cursorEl.style.top = `${top}px`;
};

const rectsIntersect = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const erasePlanesAt = (x, y) => {
  if (!pinLayer || !captureActive) return;
  const cursorRect = {
    left: x - CURSOR_SIZE / 2,
    right: x + CURSOR_SIZE / 2,
    top: y - CURSOR_SIZE / 2,
    bottom: y + CURSOR_SIZE / 2
  };
  const planes = Array.from(pinLayer.querySelectorAll(".plane"));
  planes.forEach((plane) => {
    const rect = plane.getBoundingClientRect();
    if (rectsIntersect(rect, cursorRect)) {
      plane.remove();
    }
  });
  if (!pinLayer.querySelectorAll(".plane").length) {
    captureVerified = true;
    captureActive = false;
    if (robotCheck) {
      robotCheck.checked = true;
    }
    pinLayer.classList.remove("capture-active");
    document.body.classList.remove("capture-cursor-active");
    if (cursorEl) {
      cursorEl.remove();
      cursorEl = null;
    }
    statusEl.textContent = "Verified. You're good to go!";
  } else {
    updateCursor(x, y);
  }
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const identity = document.getElementById("signin-identity");
  const password = document.getElementById("signin-password");
  const robot = document.getElementById("signin-robot");

  if (!identity.value.trim() || !password.value.trim()) {
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    statusEl.textContent = "Please fill in both fields.";
    return;
  }
  if (!robot || !robot.checked) {
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    statusEl.textContent = "Please confirm you are not a robot.";
    return;
  }

  statusEl.textContent = "Signing you in...";
  fetch(`${API_BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: identity.value.trim(), password: password.value.trim() })
  })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Signin failed.");
      }
      return res.json();
    })
    .then((user) => {
      localStorage.setItem("userProfile", JSON.stringify(user));
      statusEl.textContent = "Success! Redirecting...";
      setTimeout(() => {
        window.location.href = "user.html";
      }, 600);
    })
    .catch((err) => {
      card.classList.remove("shake");
      void card.offsetWidth;
      card.classList.add("shake");
      statusEl.textContent = err.message || "Signin failed.";
    });
});

forgotBtn.addEventListener("click", () => {
  window.location.href = "forgot.html";
});

window.addEventListener("resize", () => {
  clearTimeout(window.__planeResize);
  if (captureActive) {
    window.__planeResize = setTimeout(spawnPins, 150);
  }
});

if (robotCheck) {
  robotCheck.addEventListener("click", (event) => {
    if (!captureVerified) {
      event.preventDefault();
      robotCheck.checked = false;
      if (!captureActive) {
        spawnPins();
        ensureCursor();
        pinLayer.classList.add("capture-active");
        document.body.classList.add("capture-cursor-active");
      } else if (statusEl) {
        statusEl.textContent = "Collect all the stars to verify.";
      }
    }
  });
}

initPasswordToggles();

window.addEventListener("pointerdown", (event) => {
  if (!captureActive) return;
  draggingCapture = true;
  erasePlanesAt(event.clientX, event.clientY);
});

window.addEventListener("pointermove", (event) => {
  if (!captureActive) return;
  ensureCursor();
  updateCursor(event.clientX, event.clientY);
  if (draggingCapture) {
    erasePlanesAt(event.clientX, event.clientY);
  }
});

window.addEventListener("pointerup", () => {
  draggingCapture = false;
});
