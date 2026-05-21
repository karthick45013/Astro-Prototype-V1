const form = document.getElementById("forgot-form");
const emailInput = document.getElementById("forgot-email");
const codeInput = document.getElementById("forgot-code");
const sendCodeBtn = document.getElementById("send-code-btn");
const statusEl = document.getElementById("forgot-status");
const verifyField = document.querySelector(".verify-field");
const timerEl = document.getElementById("code-timer");
const submitBtn = document.getElementById("submit-btn");
const resetLink = document.getElementById("reset-link");

const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";

let countdownId = null;
if (codeInput) {
  codeInput.required = false;
}

const startTimer = (seconds) => {
  if (!timerEl) return;
  let remaining = seconds;
  timerEl.classList.remove("hidden");
  timerEl.textContent = "10:00";
  sendCodeBtn.disabled = true;
  if (countdownId) {
    clearInterval(countdownId);
  }
  countdownId = setInterval(() => {
    remaining -= 1;
    const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
    const secs = String(remaining % 60).padStart(2, "0");
    timerEl.textContent = `${mins}:${secs}`;
    if (remaining <= 0) {
      clearInterval(countdownId);
      countdownId = null;
      timerEl.textContent = "Code expired";
      sendCodeBtn.disabled = false;
    }
  }, 1000);
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f88b8b" : "var(--muted)";
};

sendCodeBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email || !emailRegex.test(email)) {
    setStatus("Please enter a valid email address.", true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Unable to send verification code.");
    }

    sessionStorage.setItem("reset_email", email);
    if (data.code) {
      sessionStorage.setItem("reset_code", data.code);
      setStatus(`Verification code sent. (Dev code: ${data.code})`);
    } else {
      setStatus("Verification code sent. Check your email.");
    }

    if (verifyField) {
      verifyField.classList.remove("hidden");
    }
    if (codeInput) {
      codeInput.required = true;
    }
    startTimer(600);
  } catch (error) {
    setStatus(error.message || "Unable to send verification code.", true);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const code = codeInput?.value?.trim() || "";

  if (!email || !emailRegex.test(email)) {
    setStatus("Please enter a valid email address.", true);
    return;
  }
  if (!code) {
    setStatus("Please enter verification code.", true);
    return;
  }

  sessionStorage.setItem("reset_email", email);
  sessionStorage.setItem("reset_code", code);

  if (sendCodeBtn) sendCodeBtn.classList.add("hidden");
  if (verifyField) verifyField.classList.add("hidden");
  if (timerEl) timerEl.classList.add("hidden");
  if (submitBtn) submitBtn.classList.add("hidden");
  if (resetLink) resetLink.classList.remove("hidden");

  if (countdownId) {
    clearInterval(countdownId);
    countdownId = null;
  }

  setStatus("Code verified. Open reset link to set a new password.");
  setTimeout(() => {
    window.location.href = "reset.html";
  }, 700);
});
