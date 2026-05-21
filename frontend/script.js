const baseCosts = { transport: 520, accommodation: 130, food: 55, activities: 60 };
const tripMultipliers = {
  budget: 0.8,
  moderate: 1,
  luxury: 1.35
};

const form = document.getElementById("trip-form");
const formStatus = document.getElementById("form-status");
const itineraryOutput = document.getElementById("itinerary-output");
const itinerarySection = document.getElementById("itinerary");
const costSection = document.getElementById("cost");
const costBreakdown = document.getElementById("cost-breakdown");
const currencyGrid = document.getElementById("currency-grid");
const baseCurrencySelect = document.getElementById("base-currency");
const currencyAmount = document.getElementById("currency-amount");
const currencyNote = document.getElementById("currency-note");
const scrollTopBtn = document.getElementById("scroll-top");
const toast = document.getElementById("toast");
const carouselTrack = document.querySelector(".carousel-track");
const carouselSlides = document.querySelectorAll(".carousel-slide");
const carouselPrev = document.querySelector(".carousel-btn.prev");
const carouselNext = document.querySelector(".carousel-btn.next");
const carouselContainer = document.querySelector(".destination-carousel");
const heroDescription = document.getElementById("hero-description");
const heroCountCurrent = document.getElementById("hero-count-current");
const heroCountTotal = document.getElementById("hero-count-total");
const destinationGrid = document.getElementById("destination-grid");

const destinationInput = document.getElementById("destination");
const fromInput = document.getElementById("from");
const daysInput = document.getElementById("days");
const personsInput = document.getElementById("persons");
const tripTypeSelect = document.getElementById("trip-type");
const plannerGame = document.getElementById("planner-game");
const plannerGameField = document.getElementById("planner-game-field");
const gameTimeEl = document.getElementById("game-time");
const gameScoreEl = document.getElementById("game-score");
const gamePlayerEl = document.getElementById("game-player");
const gameVortexEl = document.getElementById("game-vortex");
const gameRetryBtn = document.getElementById("game-retry");

const darkToggle = document.getElementById("dark-toggle");
const hamburger = document.getElementById("hamburger");
const mainNav = document.getElementById("main-nav");
const signUpBtn = document.getElementById("sign-up");
const profileBtn = document.getElementById("profile-btn");

const voiceStart = document.getElementById("start-voice");
const voiceStop = document.getElementById("stop-voice");
const assistantLog = document.getElementById("assistant-log");
const listeningIndicator = document.getElementById("listening-indicator");

const loadingOverlay = document.getElementById("loading-overlay");
const progressFill = document.getElementById("progress-fill");

const supportedCurrencies = ["USD", "EUR", "GBP", "INR", "JPY", "AUD"];
let cachedRates = {};
let plannerGameTimer = null;
let plannerPendingPayload = null;
let plannerGameLoop = null;
let plannerGameState = null;

const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";

const synth = window.speechSynthesis;
let recognition = null;

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
};

const formatMoney = (value) => `$${value.toFixed(0)}`;

const getSelectedInterests = () => [];

const getDestinationData = (name) => {
  if (!name || typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return { name: trimmed };
};

const renderItineraryPlaceholder = (destinationName) => {
  itineraryOutput.innerHTML = `
    <div class="day-card">
      <h4>Itinerary preview</h4>
      <p>Itinerary details will appear here once the backend is connected.</p>
      <p><strong>Destination:</strong> ${destinationName || "Your destination"}</p>
    </div>
  `;
};

const calculateCosts = ({ destination, days, persons, tripType }) => {
  const multiplier = tripMultipliers[tripType] || 1;
  const transport = baseCosts.transport * persons * multiplier;
  const accommodation = baseCosts.accommodation * (days - 1) * persons * multiplier;
  const food = baseCosts.food * days * persons * multiplier;
  const activities = baseCosts.activities * days * persons * multiplier;
  const total = transport + accommodation + food + activities;
  return {
    transport,
    accommodation,
    food,
    activities,
    total,
    perPerson: total / persons
  };
};

const renderCosts = (costs) => {
  costBreakdown.innerHTML = "";
  const cards = [
    { label: "Transportation", value: costs.transport },
    { label: "Accommodation", value: costs.accommodation },
    { label: "Food", value: costs.food },
    { label: "Activities", value: costs.activities },
    { label: "Per Person", value: costs.perPerson },
    { label: "Total Trip", value: costs.total }
  ];
  cards.forEach((card) => {
    const el = document.createElement("div");
    el.className = "cost-card";
    el.innerHTML = `<h4>${card.label}</h4><p>${formatMoney(card.value)}</p>`;
    costBreakdown.appendChild(el);
  });
};

const syncDestinationOptions = () => {
  const fromValue = fromInput.value;
  Array.from(destinationInput.options).forEach((option) => {
    if (!option.value) return;
    option.disabled = option.value === fromValue;
  });
  if (destinationInput.value === fromValue) {
    destinationInput.value = "";
  }
};
const validateForm = () => {
  const days = Number(daysInput.value);
  const persons = Number(personsInput.value);
  if (!fromInput.value.trim() || !destinationInput.value.trim()) {
    return "Please provide both From and Destination.";
  }
  if (fromInput.value.trim() === destinationInput.value.trim()) {
    return "From and Destination cannot be the same.";
  }
  if (days < 1 || days > 30) {
    return "Days must be between 1 and 30.";
  }
  if (persons < 1 || persons > 20) {
    return "Persons must be between 1 and 20.";
  }
  return null;
};

const finalizePlan = (payload) => {
  const { destinationName, days, persons, tripType } = payload;
  itinerarySection.classList.remove("hidden");
  costSection.classList.remove("hidden");
  renderItineraryPlaceholder(destinationName);
  const costs = calculateCosts({
    destination: { name: destinationName || "Your destination" },
    days,
    persons,
    tripType
  });
  renderCosts(costs);
  formStatus.textContent = `Itinerary preview ready for ${destinationName || "your destination"}!`;
  formStatus.style.color = "var(--secondary)";
  showToast("Flight cleared. Itinerary unlocked!");
};

const stopPlannerGame = () => {
  if (plannerGameTimer) {
    clearInterval(plannerGameTimer);
    plannerGameTimer = null;
  }
  if (plannerGameLoop) {
    cancelAnimationFrame(plannerGameLoop);
    plannerGameLoop = null;
  }

  if (plannerGameState?.onKeyDown) {
    document.removeEventListener("keydown", plannerGameState.onKeyDown);
  }
  if (plannerGameState?.onKeyUp) {
    document.removeEventListener("keyup", plannerGameState.onKeyUp);
  }
  if (plannerGameState?.onFieldPress) {
    plannerGameField?.removeEventListener("pointerdown", plannerGameState.onFieldPress);
    plannerGameField?.removeEventListener("touchstart", plannerGameState.onFieldPress);
  }

  plannerGameState = null;
};

const losePlannerGame = (reason) => {
  stopPlannerGame();
  formStatus.textContent = reason;
  formStatus.style.color = "#d64545";
  gameScoreEl.textContent = "Crashed";
};

const getDestinationPortalTheme = (destinationName) => {
  const name = String(destinationName || "").trim().toLowerCase();
  if (name === "paris") return { icon: "PAR", className: "portal-paris" };
  if (name === "tokyo") return { icon: "TYO", className: "portal-tokyo" };
  if (name === "bali") return { icon: "BAL", className: "portal-bali" };
  if (name === "new york") return { icon: "NYC", className: "portal-newyork" };
  if (name === "dubai") return { icon: "DXB", className: "portal-dubai" };
  if (name === "rome") return { icon: "ROM", className: "portal-rome" };
  return { icon: "DST", className: "portal-default" };
};

const startPlannerGame = () => {
  if (!plannerGame || !plannerGameField || !plannerPendingPayload || !gamePlayerEl || !gameVortexEl) return;
  stopPlannerGame();

  plannerGame.classList.remove("hidden");
  itinerarySection.classList.add("hidden");
  costSection.classList.add("hidden");
  plannerGameField.classList.remove("game-over", "game-win");

  const fieldRect = plannerGameField.getBoundingClientRect();
  const fieldWidth = Math.max(320, fieldRect.width || plannerGameField.clientWidth || 320);
  const fieldHeight = Math.max(180, fieldRect.height || plannerGameField.clientHeight || 180);
  const vortexSize = 62;
  const destinationName = plannerPendingPayload.destinationName || "Destination";
  const destinationTheme = getDestinationPortalTheme(destinationName);

  plannerGameState = {
    x: 58,
    y: fieldHeight / 2,
    moveSpeed: 4.2,
    obstacleEveryMs: 1350,
    obstacleSpeed: 3.1,
    vortexStartX: fieldWidth + 120,
    vortexTargetX: fieldWidth - 92,
    vortexX: fieldWidth + 120,
    vortexY: fieldHeight / 2 - vortexSize / 2,
    startedAt: 0,
    destinationArriveMs: 20000,
    obstacles: [],
    lastObstacleAt: 0,
    keys: { up: false, down: false, left: false, right: false },
    running: true,
    won: false
  };

  plannerGameField.querySelectorAll(".game-obstacle").forEach((el) => el.remove());

  const clampPosition = () => {
    const maxX = fieldWidth - 24;
    const maxY = fieldHeight - 24;
    if (plannerGameState.x < 0) plannerGameState.x = 0;
    if (plannerGameState.x > maxX) plannerGameState.x = maxX;
    if (plannerGameState.y < 0) plannerGameState.y = 0;
    if (plannerGameState.y > maxY) plannerGameState.y = maxY;
  };

  const onKeyDown = (event) => {
    if (!plannerGameState?.running) return;
    if (event.code === "KeyW") {
      event.preventDefault();
      plannerGameState.keys.up = true;
    }
    if (event.code === "KeyS") {
      event.preventDefault();
      plannerGameState.keys.down = true;
    }
    if (event.code === "KeyA") {
      event.preventDefault();
      plannerGameState.keys.left = true;
    }
    if (event.code === "KeyD") {
      event.preventDefault();
      plannerGameState.keys.right = true;
    }
  };

  const onKeyUp = (event) => {
    if (event.code === "KeyW") plannerGameState.keys.up = false;
    if (event.code === "KeyS") plannerGameState.keys.down = false;
    if (event.code === "KeyA") plannerGameState.keys.left = false;
    if (event.code === "KeyD") plannerGameState.keys.right = false;
  };

  plannerGameState.onKeyDown = onKeyDown;
  plannerGameState.onKeyUp = onKeyUp;
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  if (gameTimeEl?.parentElement) gameTimeEl.parentElement.style.display = "none";
  gameScoreEl.textContent = "WASD";

  gamePlayerEl.style.left = `${plannerGameState.x}px`;
  gamePlayerEl.style.top = `${plannerGameState.y}px`;
  gameVortexEl.textContent = destinationTheme.icon;
  gameVortexEl.dataset.label = destinationName;
  gameVortexEl.className = `game-vortex ${destinationTheme.className}`;
  gameVortexEl.style.left = `${plannerGameState.vortexX}px`;
  gameVortexEl.style.top = `${plannerGameState.vortexY}px`;

  const spawnObstacle = () => {
    const birdY = 18 + Math.random() * Math.max(10, fieldHeight - 42);
    const birdEl = document.createElement("div");
    birdEl.className = "game-obstacle bird";
    birdEl.style.left = `${fieldWidth + 14}px`;
    birdEl.style.top = `${birdY}px`;
    plannerGameField.appendChild(birdEl);
    plannerGameState.obstacles.push({ x: fieldWidth + 14, y: birdY, width: 34, height: 18, el: birdEl });
  };

  const hitObstacle = (obstacle) => {
    const shipLeft = plannerGameState.x;
    const shipTop = plannerGameState.y;
    const shipSize = 24;
    const shipRight = shipLeft + shipSize;
    const shipBottom = shipTop + shipSize;
    const birdRight = obstacle.x + obstacle.width;
    const birdBottom = obstacle.y + obstacle.height;
    return shipRight > obstacle.x && shipLeft < birdRight && shipBottom > obstacle.y && shipTop < birdBottom;
  };

  const hitVortex = () => {
    const shipCx = plannerGameState.x + 12;
    const shipCy = plannerGameState.y + 12;
    const vortexCx = plannerGameState.vortexX + vortexSize / 2;
    const vortexCy = plannerGameState.vortexY + vortexSize / 2;
    const dx = shipCx - vortexCx;
    const dy = shipCy - vortexCy;
    return Math.hypot(dx, dy) < 27;
  };

  const loop = (now) => {
    if (!plannerGameState?.running) return;

    if (!plannerGameState.startedAt) plannerGameState.startedAt = now;

    if (plannerGameState.keys.up) plannerGameState.y -= plannerGameState.moveSpeed;
    if (plannerGameState.keys.down) plannerGameState.y += plannerGameState.moveSpeed;
    if (plannerGameState.keys.left) plannerGameState.x -= plannerGameState.moveSpeed;
    if (plannerGameState.keys.right) plannerGameState.x += plannerGameState.moveSpeed;
    clampPosition();

    if (now - plannerGameState.lastObstacleAt >= plannerGameState.obstacleEveryMs) {
      spawnObstacle();
      plannerGameState.lastObstacleAt = now;
    }

    let collided = false;
    plannerGameState.obstacles = plannerGameState.obstacles.filter((obstacle) => {
      obstacle.x -= plannerGameState.obstacleSpeed;
      obstacle.el.style.left = `${obstacle.x}px`;
      if (hitObstacle(obstacle)) {
        collided = true;
        return false;
      }
      if (obstacle.x + obstacle.width < -30) {
        obstacle.el.remove();
        return false;
      }
      return true;
    });

    if (collided) {
      losePlannerGame("You crashed into an object. Retry to unlock results.");
      return;
    }

    const elapsed = now - plannerGameState.startedAt;
    const progress = Math.min(1, elapsed / plannerGameState.destinationArriveMs);
    plannerGameState.vortexX =
      plannerGameState.vortexStartX +
      (plannerGameState.vortexTargetX - plannerGameState.vortexStartX) * progress;
    gameVortexEl.style.left = `${plannerGameState.vortexX}px`;
    gameVortexEl.style.top = `${plannerGameState.vortexY}px`;

    if (progress >= 1 && hitVortex()) {
      plannerGameState.running = false;
      plannerGameState.won = true;
      plannerGameField.classList.add("game-win");
      stopPlannerGame();
      plannerGame.classList.add("hidden");
      finalizePlan(plannerPendingPayload);
      plannerPendingPayload = null;
      return;
    }

    gamePlayerEl.style.left = `${plannerGameState.x}px`;
    gamePlayerEl.style.top = `${plannerGameState.y}px`;
    plannerGameLoop = requestAnimationFrame(loop);
  };

  plannerGameLoop = requestAnimationFrame(loop);
};

const handlePlan = () => {
  const validationError = validateForm();
  if (validationError) {
    formStatus.textContent = validationError;
    formStatus.style.color = "#d64545";
    return;
  }

  plannerPendingPayload = {
    destinationName: destinationInput.value.trim(),
    days: Number(daysInput.value),
    persons: Number(personsInput.value),
    tripType: tripTypeSelect.value
  };

  formStatus.textContent = "Complete the flight challenge: W up, S down, A left, D right.";
  formStatus.style.color = "var(--text-muted)";
  startPlannerGame();
};



const buildCurrencyCards = () => {
  currencyGrid.innerHTML = "";
  const base = baseCurrencySelect.value;
  const amount = Number(currencyAmount.value);
  supportedCurrencies.forEach((currency) => {
    const rate = cachedRates[base]?.[currency] || 1;
    const value = (amount * rate).toFixed(2);
    const card = document.createElement("div");
    card.className = "currency-card";
    card.innerHTML = `
      <h4>${currency}</h4>
      <p>${value}</p>
      <small>Rate: ${rate.toFixed(4)}</small>
    `;
    currencyGrid.appendChild(card);
  });
};

const fetchRates = async () => {
  const base = baseCurrencySelect.value;
  currencyNote.textContent = "Loading rates...";
  try {
    const response = await fetch(`https://api.exchangerate.host/latest?base=${base}`);
    const data = await response.json();
    if (data?.rates) {
      cachedRates[base] = data.rates;
      currencyNote.textContent = `Rates updated for ${base}.`;
      buildCurrencyCards();
      return;
    }
    throw new Error("No data");
  } catch (error) {
    cachedRates[base] = cachedRates[base] || fallbackRates(base);
    currencyNote.textContent = "Using fallback rates (offline).";
    buildCurrencyCards();
  }
};

const fallbackRates = (base) => {
  const baseRates = {
    USD: { EUR: 0.91, GBP: 0.78, INR: 83.2, JPY: 150.4, AUD: 1.52, USD: 1 },
    EUR: { USD: 1.1, GBP: 0.86, INR: 91.3, JPY: 165.2, AUD: 1.67, EUR: 1 },
    GBP: { USD: 1.27, EUR: 1.16, INR: 106.5, JPY: 192.3, AUD: 1.92, GBP: 1 },
    INR: { USD: 0.012, EUR: 0.011, GBP: 0.0094, JPY: 1.8, AUD: 0.018, INR: 1 },
    JPY: { USD: 0.0066, EUR: 0.006, GBP: 0.0052, INR: 0.56, AUD: 0.01, JPY: 1 },
    AUD: { USD: 0.66, EUR: 0.6, GBP: 0.52, INR: 55.1, JPY: 98.7, AUD: 1 }
  };
  return baseRates[base] || baseRates.USD;
};

const setupReveal = () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
};

const setupParallax = () => {
  const elements = document.querySelectorAll("[data-parallax]");
  window.addEventListener("scroll", () => {
    const offset = window.scrollY;
    elements.forEach((el) => {
      const speed = Number(el.dataset.parallax) || 0.2;
      el.style.transform = `translateY(${offset * speed * 0.1}px)`;
    });
  });
};

const setupRipple = () => {
  document.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", (event) => {
      const ripple = document.createElement("span");
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.className = "ripple";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      button.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });
};

const setupParticleCanvas = () => {
  const canvas = document.getElementById("particle-canvas");
  const ctx = canvas.getContext("2d");
  let width = window.innerWidth;
  let height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const particles = Array.from({ length: 50 }).map(() => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: Math.random() * 3 + 1,
    speed: Math.random() * 0.6 + 0.2
  }));

  const animate = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    particles.forEach((p) => {
      p.y -= p.speed;
      if (p.y < -10) p.y = height + 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(animate);
  };

  animate();

  window.addEventListener("resize", () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  });
};

const setupScrollTop = () => {
  window.addEventListener("scroll", () => {
    scrollTopBtn.style.display = window.scrollY > 600 ? "block" : "none";
  });
  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
};

const setupOfflineBanner = () => {
  const banner = document.createElement("div");
  banner.className = "offline-banner";
  banner.textContent = "You are offline. Using cached data.";

  const updateStatus = () => {
    if (!navigator.onLine) {
      document.body.appendChild(banner);
    } else if (banner.parentElement) {
      banner.remove();
    }
  };

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
  updateStatus();
};

const setupKeyboardShortcuts = () => {
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      destinationInput.focus();
      showToast("Focused destination input");
    }
    if (event.ctrlKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
};

const setupHamburger = () => {
  hamburger.addEventListener("click", () => {
    mainNav.classList.toggle("open");
  });
};

const syncThemeToggleUi = () => {
  if (!darkToggle) return;
  const isDark = document.body.classList.contains("dark");
  darkToggle.setAttribute("aria-pressed", String(isDark));
  darkToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
};

const handleDarkMode = () => {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  syncThemeToggleUi();
};

const applyTheme = () => {
  const path = window.location.pathname.toLowerCase();
  const isIndexPage = path.endsWith("/index.html") || path.endsWith("/");
  if (isIndexPage) {
    document.body.classList.add("dark");
    localStorage.setItem("theme", "dark");
    syncThemeToggleUi();
    return;
  }

  const stored = localStorage.getItem("theme");
  if (stored === "light") {
    document.body.classList.remove("dark");
  } else {
    document.body.classList.add("dark");
    if (!stored) {
      localStorage.setItem("theme", "dark");
    }
  }
  syncThemeToggleUi();
};

const syncAuthUi = async () => {
  if (!signUpBtn) return;
  if (profileBtn) {
    profileBtn.classList.add("hidden");
  }

  signUpBtn.classList.add("hidden");

  const setSignedOut = () => {
    signUpBtn.classList.remove("hidden");
    if (profileBtn) {
      profileBtn.classList.add("hidden");
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include"
    });
    if (!response.ok) {
      setSignedOut();
      return;
    }
    const user = await response.json();
    localStorage.setItem("userProfile", JSON.stringify(user));
    window.location.replace("user.html");
  } catch (_) {
    setSignedOut();
  }
};

const handleVoiceCommand = (text) => {
  const message = text.toLowerCase();
  const respond = (response) => {
    assistantLog.innerHTML = `<strong>You:</strong> ${text}<br/><strong>Assistant:</strong> ${response}`;
    if (synth) {
      const utter = new SpeechSynthesisUtterance(response);
      synth.speak(utter);
    }
  };

    if (message.includes("plan")) {
    handlePlan();
    respond("Planning your trip.");
    return;
  }
  if (message.includes("show itinerary")) {
    document.getElementById("itinerary").scrollIntoView({ behavior: "smooth" });
    respond("Here is your itinerary.");
    return;
  }
  if (message.includes("estimate cost")) {
    document.getElementById("cost").scrollIntoView({ behavior: "smooth" });
    respond("Showing the cost breakdown.");
    return;
  }
  if (message.includes("open currency")) {
    document.getElementById("currency").scrollIntoView({ behavior: "smooth" });
    respond("Opening the currency converter.");
    return;
  }
  if (message.includes("go home")) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    respond("Heading back to the top.");
    return;
  }
  if (message.includes("toggle dark")) {
    handleDarkMode();
    respond("Switching the theme.");
    return;
  }
  const daysMatch = message.match(/days\s*(to|=)?\s*(\d+)/);
  if (daysMatch) {
    daysInput.value = Math.min(30, Math.max(1, Number(daysMatch[2])));
    respond(`Setting days to ${daysInput.value}.`);
    return;
  }
  const personsMatch = message.match(/persons?\s*(to|=)?\s*(\d+)/);
  if (personsMatch) {
    personsInput.value = Math.min(20, Math.max(1, Number(personsMatch[2])));
    respond(`Setting persons to ${personsInput.value}.`);
    return;
  }
  if (message.includes("luxury")) {
    tripTypeSelect.value = "luxury";
    respond("Switching to luxury mode.");
    return;
  }
  if (message.includes("budget")) {
    tripTypeSelect.value = "budget";
    respond("Switching to budget mode.");
    return;
  }
  respond("I heard you. Try a command like 'Plan a trip to Paris'.");
};

const setupVoiceAssistant = () => {
  if (!voiceStart || !voiceStop || !assistantLog || !listeningIndicator) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    assistantLog.textContent = "Voice assistant not supported in this browser.";
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;

  recognition.onstart = () => {
    listeningIndicator.classList.add("active");
    assistantLog.textContent = "Listening...";
  };

  recognition.onend = () => {
    listeningIndicator.classList.remove("active");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    handleVoiceCommand(transcript);
  };

  voiceStart.addEventListener("click", () => recognition.start());
  voiceStop.addEventListener("click", () => recognition.stop());
};

const setupLoading = () => {
  if (!loadingOverlay || !progressFill) return;

  const waitForHeroImage = () =>
    new Promise((resolve) => {
      const heroImg = document.querySelector(".carousel-slide img");
      if (!heroImg) {
        resolve();
        return;
      }
      if (heroImg.complete && heroImg.naturalWidth > 0) {
        resolve();
        return;
      }

      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      heroImg.addEventListener("load", done, { once: true });
      heroImg.addEventListener("error", done, { once: true });
      setTimeout(done, 10000);
    });

  let progress = 0;
  const interval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 8 + 2, 88);
    progressFill.style.width = `${progress}%`;
  }, 180);

  waitForHeroImage().then(() => {
    clearInterval(interval);
    progressFill.style.width = "100%";
    setTimeout(() => {
      loadingOverlay.style.display = "none";
    }, 350);
  });
};

const setupCarousel = () => {
  if (!carouselSlides.length) return;
  let index = 0;
  let prevIndex = 0;
  let timer = null;
  const isFoxStyle = carouselContainer?.classList.contains("fx-carousel");
  const heroTitle = document.getElementById("hero-title");

  const cardKeys = [
    { suffix: "a", selector: "[data-card='a']" },
    { suffix: "b", selector: "[data-card='b']" },
    { suffix: "c", selector: "[data-card='c']" }
  ];

  if (heroCountTotal) {
    heroCountTotal.textContent = String(carouselSlides.length).padStart(2, "0");
  }

  const goTo = (next) => {
    prevIndex = index;
    index = (next + carouselSlides.length) % carouselSlides.length;
    if (!isFoxStyle && carouselTrack) {
      carouselTrack.style.transform = `translateX(-${index * 100}%)`;
    }
    carouselSlides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === index);
      slide.classList.toggle("is-outgoing", i === prevIndex && i !== index);
    });
    if (heroCountCurrent) {
      heroCountCurrent.textContent = String(index + 1).padStart(2, "0");
    }

    const activeSlide = carouselSlides[index];
    if (heroTitle) {
      heroTitle.textContent = activeSlide.dataset.title || "BALI";
      heroTitle.classList.remove("caption-swap");
      void heroTitle.offsetWidth;
      heroTitle.classList.add("caption-swap");
    }
    if (heroDescription) {
      heroDescription.textContent =
        activeSlide.dataset.description ||
        "A cinematic destination with bold landscapes and immersive travel moments.";
    }
    cardKeys.forEach(({ suffix, selector }) => {
      const card = document.querySelector(selector);
      if (!card) return;
      const title = activeSlide.dataset[`card${suffix.toUpperCase()}Title`] || "Destination";
      const image = activeSlide.dataset[`card${suffix.toUpperCase()}Image`];
      const heading = card.querySelector("h3");
      const img = card.querySelector("img");
      if (heading) heading.textContent = title;
      if (img && image) {
        img.src = image;
        img.alt = title;
      }
      card.classList.remove("card-swap");
      void card.offsetWidth;
      card.classList.add("card-swap");
    });
  };

  const start = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(() => goTo(index + 1), isFoxStyle ? 5000 : 3000);
  };

  carouselPrev?.addEventListener("click", () => {
    goTo(index - 1);
    start();
  });

  carouselNext?.addEventListener("click", () => {
    goTo(index + 1);
    start();
  });

  goTo(0);
  start();
};

const setupMouseTrail = () => {
  const layer = document.createElement("div");
  layer.id = "mouse-trail-layer";
  document.body.appendChild(layer);

  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;

  const spawnDot = (x, y) => {
    const dot = document.createElement("span");
    const isDark = document.body.classList.contains("dark");
    dot.className = `mouse-trail ${isDark ? "star" : "dot"}`;
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.transform = "translate(-50%, -50%)";
    layer.appendChild(dot);
    setTimeout(() => dot.remove(), 2400);
  };

  window.addEventListener("mousemove", (event) => {
    const now = performance.now();
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    const dist = Math.hypot(dx, dy);

    if (now - lastTime > 50 && dist > 5) {
      spawnDot(event.clientX, event.clientY);
      lastX = event.clientX;
      lastY = event.clientY;
      lastTime = now;
    }
  });
};
const setupScrollButtons = () => {
  document.querySelectorAll("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.querySelector(btn.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: "smooth" });
    });
  });
};

const setupImageFallbacks = () => {
  const fallback = "https://images.pexels.com/photos/457882/pexels-photo-457882.jpeg?auto=compress&cs=tinysrgb&w=1400";
  document.querySelectorAll(".fx-carousel img, .hero-preview-card img").forEach((img) => {
    img.addEventListener("error", () => {
      if (!img.dataset.fallbackApplied) {
        img.dataset.fallbackApplied = "1";
        img.src = fallback;
      }
    });
  });
};

const init = () => {
  applyTheme();
  setupLoading();
  
  
  setupReveal();
  setupParallax();
  setupRipple();
  setupParticleCanvas();
  setupScrollTop();
  setupOfflineBanner();
  setupKeyboardShortcuts();
  setupHamburger();
  setupScrollButtons();
  setupMouseTrail();
  setupImageFallbacks();

  setupCarousel();

  setupVoiceAssistant();

  fetchRates();
  buildCurrencyCards();
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  handlePlan();
});

form.addEventListener("input", () => {
  formStatus.textContent = "";
});

fromInput.addEventListener("change", syncDestinationOptions);

tripTypeSelect.addEventListener("change", () => {
  formStatus.textContent = "";
});

const resetFormBtn = document.getElementById("reset-form");
resetFormBtn.addEventListener("click", () => {
  form.reset();
  stopPlannerGame();
  if (plannerGame) plannerGame.classList.add("hidden");
  if (plannerGameField) {
    plannerGameField.querySelectorAll(".game-obstacle").forEach((el) => el.remove());
    plannerGameField.classList.remove("game-win", "game-over");
  }
  if (gameTimeEl) gameTimeEl.textContent = "30";
  if (gameScoreEl) gameScoreEl.textContent = "Ready";
  plannerPendingPayload = null;
  formStatus.textContent = "Form cleared.";
  formStatus.style.color = "var(--text-muted)";
});

if (gameRetryBtn) {
  gameRetryBtn.addEventListener("click", () => {
    if (!plannerPendingPayload) return;
    startPlannerGame();
  });
}

baseCurrencySelect.addEventListener("change", fetchRates);
currencyAmount.addEventListener("input", buildCurrencyCards);
document.getElementById("refresh-rates").addEventListener("click", fetchRates);

if (destinationGrid) {
  destinationGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-destination]");
    if (!button) return;
    const dest = button.dataset.destination;
    destinationInput.value = dest;
    fromInput.value = fromInput.value || "Your city";
    handlePlan();
    document.getElementById("planner").scrollIntoView({ behavior: "smooth" });
  });
}

const printBtn = document.getElementById("print-itinerary");
printBtn.addEventListener("click", () => window.print());

const shareBtn = document.getElementById("share-itinerary");
shareBtn.addEventListener("click", async () => {
  const text = itineraryOutput.textContent.slice(0, 2000);
  if (navigator.share) {
    await navigator.share({ title: "My Trip Itinerary", text });
  } else {
    await navigator.clipboard.writeText(text);
    showToast("Itinerary copied to clipboard");
  }
});

if (darkToggle) {
  darkToggle.addEventListener("click", handleDarkMode);
}

if (signUpBtn) {
  signUpBtn.addEventListener("click", () => {
    window.location.href = "signup.html";
  });
}

if (profileBtn) {
  profileBtn.addEventListener("click", () => {
    window.location.href = "user.html";
  });
}

const contactForm = document.getElementById("contact-form");
const contactStatus = document.getElementById("contact-status");
contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const [nameInput, emailInput, messageInput] = contactForm.querySelectorAll("input, textarea");
  const payload = {
    name: nameInput?.value?.trim() || "",
    email: emailInput?.value?.trim() || "",
    message: messageInput?.value?.trim() || ""
  };
  try {
    const response = await fetch(`${API_BASE}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Failed to send message.");
    }
    contactStatus.textContent = "Thanks! We'll reply within 24 hours.";
    contactStatus.style.color = "var(--secondary)";
    contactForm.reset();
  } catch (error) {
    contactStatus.textContent = error.message || "Unable to send message right now.";
    contactStatus.style.color = "#d64545";
  }
});

const newsletterForm = document.getElementById("newsletter-form");
newsletterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = newsletterForm.querySelector("input[type='email']");
  const email = input?.value?.trim() || "";
  try {
    const response = await fetch(`${API_BASE}/api/newsletter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Subscription failed.");
    }
    showToast(data.message || "Subscribed to the newsletter");
    newsletterForm.reset();
  } catch (error) {
    showToast(error.message || "Unable to subscribe right now");
  }
});

window.addEventListener("load", () => {
  init();
  syncAuthUi();
});
