const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";

const SETTINGS_KEY = "userSettings";

const settingsForm = document.getElementById("settings-form");
const settingsEmail = document.getElementById("settings-email");
const defaultTripType = document.getElementById("default-trip-type");
const preferredCurrency = document.getElementById("preferred-currency");
const voiceShortcuts = document.getElementById("voice-shortcuts");
const resetSettings = document.getElementById("reset-settings");
const settingsStatus = document.getElementById("settings-status");

const defaultSettings = {
  tripType: "moderate",
  currency: "USD",
  voiceHints: true
};

const setStatus = (message, isError = false) => {
  if (!settingsStatus) return;
  settingsStatus.textContent = message;
  settingsStatus.style.color = isError ? "#c24652" : "#2f8b63";
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
    if (!cached) return {};
    try {
      return JSON.parse(cached);
    } catch (_) {
      return {};
    }
  }
};

const readSettings = () => {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (!saved) return { ...defaultSettings };
  try {
    const parsed = JSON.parse(saved);
    return {
      tripType: parsed.tripType || defaultSettings.tripType,
      currency: parsed.currency || defaultSettings.currency,
      voiceHints: typeof parsed.voiceHints === "boolean" ? parsed.voiceHints : defaultSettings.voiceHints
    };
  } catch (_) {
    return { ...defaultSettings };
  }
};

const applySettingsToForm = (settings) => {
  if (defaultTripType) defaultTripType.value = settings.tripType;
  if (preferredCurrency) preferredCurrency.value = settings.currency;
  if (voiceShortcuts) voiceShortcuts.checked = settings.voiceHints;
};

const collectSettingsFromForm = () => ({
  tripType: defaultTripType?.value || defaultSettings.tripType,
  currency: preferredCurrency?.value || defaultSettings.currency,
  voiceHints: Boolean(voiceShortcuts?.checked)
});

const saveSettings = (settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

window.addEventListener("load", async () => {
  const user = await ensureAuthenticated();
  if (user === null) return;

  if (settingsEmail) settingsEmail.value = user?.email || "";
  applySettingsToForm(readSettings());

  settingsForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const settings = collectSettingsFromForm();
    saveSettings(settings);
    setStatus("Settings saved.");
  });

  resetSettings?.addEventListener("click", () => {
    applySettingsToForm(defaultSettings);
    saveSettings(defaultSettings);
    setStatus("Defaults restored.");
  });
});
