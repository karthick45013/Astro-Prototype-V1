const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";
const AVATAR_KEY = "userAvatarImage";
const TRIP_HISTORY_KEY = "userTripHistory";

const featureFab = document.getElementById("feature-fab");
const featureMenu = document.getElementById("feature-menu");
const featureProfile = document.getElementById("feature-profile");
const featureGps = document.getElementById("feature-gps");
const featureSettings = document.getElementById("feature-settings");
const featureLogout = document.getElementById("feature-logout");
const userTripForm = document.getElementById("user-trip-form");
const userFromInput = document.getElementById("user-from");
const userDestinationInput = document.getElementById("user-destination");
const userDaysInput = document.getElementById("user-days");
const userPersonsInput = document.getElementById("user-persons");
const userTripTypeInput = document.getElementById("user-trip-type");
const userResetFormBtn = document.getElementById("user-reset-form");
const userFormStatus = document.getElementById("user-form-status");
const userPlannerOutput = document.getElementById("user-planner-output");
const userItineraryOutput = document.getElementById("user-itinerary-output");
const userCostBreakdown = document.getElementById("user-cost-breakdown");
const plannerBaseCosts = { accommodation: 130, food: 55, activities: 60 };
const plannerMultipliers = { budget: 0.8, moderate: 1, luxury: 1.35 };
const routeFlightCost = {
  "Paris|Tokyo": 980,
  "Paris|Bali": 860,
  "Paris|New York": 740,
  "Paris|Dubai": 610,
  "Paris|Rome": 170,
  "Tokyo|Bali": 520,
  "Tokyo|New York": 1080,
  "Tokyo|Dubai": 760,
  "Tokyo|Rome": 820,
  "Bali|New York": 1220,
  "Bali|Dubai": 700,
  "Bali|Rome": 780,
  "New York|Dubai": 890,
  "New York|Rome": 690,
  "Dubai|Rome": 360
};

const ensureAuthenticated = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (!res.ok) {
      localStorage.removeItem("userProfile");
      window.location.href = "signin.html";
      return false;
    }
    const user = await res.json();
    localStorage.setItem("userProfile", JSON.stringify(user));
    return true;
  } catch (_) {
    return true;
  }
};

const applyFabAvatar = () => {
  if (!featureFab) return;
  const saved = localStorage.getItem(AVATAR_KEY);
  if (saved) {
    featureFab.style.backgroundImage = `url("${saved}")`;
    featureFab.classList.add("has-image");
  }
};

const setupHeroCarousel = () => {
  const slides = Array.from(document.querySelectorAll(".carousel-slide"));
  const heroTitle = document.getElementById("hero-title");
  const heroDescription = document.getElementById("hero-description");
  if (!slides.length || !heroTitle || !heroDescription) return;

  const cardKeys = [
    { suffix: "a", selector: "[data-card='a']" },
    { suffix: "b", selector: "[data-card='b']" },
    { suffix: "c", selector: "[data-card='c']" }
  ];

  let index = 0;
  let prevIndex = 0;

  const goTo = (next) => {
    prevIndex = index;
    index = (next + slides.length) % slides.length;

    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === index);
      slide.classList.toggle("is-outgoing", i === prevIndex && i !== index);
    });

    const activeSlide = slides[index];
    heroTitle.textContent = activeSlide.dataset.title || "BALI";
    heroTitle.classList.remove("caption-swap");
    void heroTitle.offsetWidth;
    heroTitle.classList.add("caption-swap");

    heroDescription.textContent =
      activeSlide.dataset.description ||
      "A cinematic destination with bold landscapes and immersive travel moments.";

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

  goTo(0);
  setInterval(() => goTo(index + 1), 6800);
};

const setupScrollReveal = () => {
  const selectors = [
    ".hero-fx .fx-copy",
    ".hero-fx .fx-cards",
    ".hero-preview-card",
    "#hero-title",
    "#hero-description",
    ".user-planner",
    ".user-planner-head h2",
    ".user-planner-head p",
    ".user-form-grid label",
    ".user-form-actions",
    ".user-output-block"
  ];
  const targets = Array.from(new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))));
  if (!targets.length) return;

  targets.forEach((element, index) => {
    element.classList.add("reveal-up");
    element.style.transitionDelay = `${Math.min(index * 40, 220)}ms`;
  });

  if (!("IntersectionObserver" in window)) {
    targets.forEach((element) => element.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
          entry.target.classList.add("visible");
          return;
        }
        entry.target.classList.remove("visible");
      });
    },
    { threshold: [0, 0.2, 0.45], rootMargin: "0px 0px -10% 0px" }
  );

  targets.forEach((element) => observer.observe(element));
};

const setupUserTripForm = () => {
  if (
    !userTripForm ||
    !userFromInput ||
    !userDestinationInput ||
    !userDaysInput ||
    !userPersonsInput ||
    !userTripTypeInput ||
    !userFormStatus ||
    !userPlannerOutput ||
    !userItineraryOutput ||
    !userCostBreakdown
  ) {
    return;
  }

  const formatMoney = (value) => `$${Number(value || 0).toFixed(0)}`;
  const getFlightCostPerPerson = (from, destination) => {
    const directKey = `${from}|${destination}`;
    const reverseKey = `${destination}|${from}`;
    return routeFlightCost[directKey] || routeFlightCost[reverseKey] || 650;
  };
  const saveTripToHistory = (trip) => {
    const saved = localStorage.getItem(TRIP_HISTORY_KEY);
    let history = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) history = parsed;
      } catch (_) {
        history = [];
      }
    }
    history.unshift({
      ...trip,
      plannedAt: new Date().toISOString()
    });
    localStorage.setItem(TRIP_HISTORY_KEY, JSON.stringify(history.slice(0, 25)));
  };

  const calculateCosts = ({ from, destination, days, persons, tripType }) => {
    const multiplier = plannerMultipliers[tripType] || 1;
    const flightPerPerson = getFlightCostPerPerson(from, destination);
    const localTransportPerDay = 28;
    const transport =
      (flightPerPerson * persons + localTransportPerDay * days * persons) * multiplier;
    const accommodation = plannerBaseCosts.accommodation * Math.max(1, days - 1) * persons * multiplier;
    const food = plannerBaseCosts.food * days * persons * multiplier;
    const activities = plannerBaseCosts.activities * days * persons * multiplier;
    const total = transport + accommodation + food + activities;
    return {
      transport,
      accommodation,
      food,
      activities,
      total,
      perPerson: total / Math.max(1, persons)
    };
  };

  const renderItinerary = ({ from, destination, days, persons, tripType }) => {
    userItineraryOutput.innerHTML = `
      <div class="day-card">
        <p><strong>From:</strong> ${from}</p>
        <p><strong>Destination:</strong> ${destination}</p>
        <p><strong>Duration:</strong> ${days} day(s)</p>
        <p><strong>Travelers:</strong> ${persons}</p>
        <p><strong>Trip Type:</strong> ${tripType}</p>
      </div>
    `;
  };

  const renderCosts = (costs) => {
    const cards = [
      { label: "Transportation", value: costs.transport },
      { label: "Accommodation", value: costs.accommodation },
      { label: "Food", value: costs.food },
      { label: "Activities", value: costs.activities },
      { label: "Per Person", value: costs.perPerson },
      { label: "Total Trip", value: costs.total }
    ];
    userCostBreakdown.innerHTML = cards
      .map(
        (card) =>
          `<div class="user-cost-card"><h4>${card.label}</h4><p>${formatMoney(card.value)}</p></div>`
      )
      .join("");
  };

  const setStatus = (message, isError = false) => {
    userFormStatus.textContent = message;
    userFormStatus.style.color = isError ? "#f09aa2" : "#88d6b8";
  };

  const validate = () => {
    const from = userFromInput.value.trim();
    const destination = userDestinationInput.value.trim();
    const days = Number(userDaysInput.value);
    const persons = Number(userPersonsInput.value);
    if (!from || !destination) return "Please provide both From and Destination.";
    if (from === destination) return "From and Destination cannot be the same.";
    if (days < 1 || days > 30) return "Days must be between 1 and 30.";
    if (persons < 1 || persons > 20) return "Persons must be between 1 and 20.";
    return "";
  };

  userTripForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = validate();
    if (error) {
      setStatus(error, true);
      return;
    }
    const payload = {
      from: userFromInput.value.trim(),
      destination: userDestinationInput.value.trim(),
      days: Number(userDaysInput.value),
      persons: Number(userPersonsInput.value),
      tripType: userTripTypeInput.value
    };
    renderItinerary(payload);
    renderCosts(calculateCosts(payload));
    saveTripToHistory(payload);
    userPlannerOutput.classList.remove("hidden");
    setStatus(`Trip details ready for ${payload.destination}.`);
  });

  userTripForm.addEventListener("input", () => {
    if (!userFormStatus.textContent) return;
    setStatus("");
  });

  userFromInput.addEventListener("change", () => {
    Array.from(userDestinationInput.options).forEach((option) => {
      if (!option.value) return;
      option.disabled = option.value === userFromInput.value;
    });
    if (userDestinationInput.value === userFromInput.value) {
      userDestinationInput.value = "";
    }
  });

  userResetFormBtn?.addEventListener("click", () => {
    userTripForm.reset();
    userDaysInput.value = "5";
    userPersonsInput.value = "2";
    userTripTypeInput.value = "moderate";
    userPlannerOutput.classList.add("hidden");
    userItineraryOutput.innerHTML = "";
    userCostBreakdown.innerHTML = "";
    setStatus("Form cleared.");
  });
};

const setupFeatureMenu = () => {
  if (!featureFab || !featureMenu) return;

  const setOpen = (open) => {
    featureMenu.classList.toggle("open", open);
    featureFab.setAttribute("aria-expanded", String(open));
    featureMenu.setAttribute("aria-hidden", String(!open));
  };

  featureFab.addEventListener("click", () => {
    const willOpen = !featureMenu.classList.contains("open");
    setOpen(willOpen);
  });

  document.addEventListener("click", (event) => {
    if (!featureMenu.classList.contains("open")) return;
    const target = event.target;
    if (target instanceof Node && !featureMenu.contains(target) && !featureFab.contains(target)) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });

  featureProfile?.addEventListener("click", () => {
    window.location.href = "profile.html";
  });

  featureGps?.addEventListener("click", () => {
    window.location.href = "gps.html";
  });

  featureSettings?.addEventListener("click", () => {
    window.location.href = "settings.html";
  });
};

const setupLogout = () => {
  if (!featureLogout) return;
  featureLogout.addEventListener("click", async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (_) {
      // ignore logout network errors
    }
    localStorage.removeItem("userProfile");
    window.location.href = "index.html";
  });
};

window.addEventListener("load", async () => {
  const ok = await ensureAuthenticated();
  if (!ok) return;
  setupHeroCarousel();
  applyFabAvatar();
  setupFeatureMenu();
  if (typeof window.initUserAI === "function") {
    window.initUserAI();
  }
  setupLogout();
  setupUserTripForm();
  setupScrollReveal();
});
