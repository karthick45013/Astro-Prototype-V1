const form = document.getElementById("signup-form");
const statusEl = document.getElementById("signup-status");
const inputs = document.querySelectorAll(".input-wrap");
const card = document.getElementById("signup-card");
const submitBtn = document.querySelector(".signup-btn");
const pinLayer = document.getElementById("signup-pin-layer");
const robotCheck = document.getElementById("signup-robot");
const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

inputs.forEach((wrap) => {
  const input = wrap.querySelector("input");
  input.addEventListener("focus", () => wrap.classList.add("active"));
  input.addEventListener("blur", () => wrap.classList.remove("active"));
});

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
  setStatus("Collect all the stars to verify.");
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

submitBtn.addEventListener("click", () => {
  submitBtn.classList.add("clicked");
  setTimeout(() => submitBtn.classList.remove("clicked"), 700);
});

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f88b8b" : "var(--secondary)";
};

const shakeCard = () => {
  if (!card) return;
  card.classList.remove("shake");
  void card.offsetWidth;
  card.classList.add("shake");
};

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
  const layerRect = pinLayer.getBoundingClientRect();
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
    setStatus("Verified. You're good to go!");
  } else {
    updateCursor(x, y);
  }
};

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

window.addEventListener("resize", () => {
  clearTimeout(window.__planeResize);
  if (captureActive) {
    window.__planeResize = setTimeout(spawnPins, 150);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("signup-name");
  const email = document.getElementById("signup-email");
  const password = document.getElementById("signup-password");
  const confirm = document.getElementById("signup-confirm");
  const robot = document.getElementById("signup-robot");

  if (!name.value.trim()) {
    shakeCard();
    setStatus("Please enter your name.", true);
    return;
  }

  if (!email.value.trim() || !emailRegex.test(email.value.trim()) || !email.checkValidity()) {
    shakeCard();
    setStatus("Please enter a valid email address.", true);
    return;
  }

  if (password.value.trim().length < 8) {
    shakeCard();
    setStatus("Password must be at least 8 characters.", true);
    return;
  }

  if (password.value !== confirm.value) {
    shakeCard();
    setStatus("Passwords do not match.", true);
    return;
  }
  if (!robot || !robot.checked) {
    shakeCard();
    setStatus("Please confirm you are not a robot.", true);
    return;
  }

  setStatus("Creating your account...");
  fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: name.value.trim(),
      email: email.value.trim(),
      password: password.value.trim()
    })
  })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Signup failed.");
      }
      return res.json();
    })
    .then((user) => {
      localStorage.setItem("userProfile", JSON.stringify(user));
      setStatus("Account created! Redirecting...");
      setTimeout(() => {
        window.location.href = "user.html";
      }, 600);
    })
    .catch((err) => {
      shakeCard();
      setStatus(err.message || "Signup failed.", true);
    });
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
      } else {
        setStatus("Collect all the stars to verify.");
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
