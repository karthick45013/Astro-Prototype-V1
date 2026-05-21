const form = document.getElementById("reset-form");
const passwordInput = document.getElementById("reset-password");
const confirmInput = document.getElementById("reset-confirm");
const statusEl = document.getElementById("reset-status");

const API_BASE =
  window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:4000`
    : "http://localhost:4000";

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f88b8b" : "var(--muted)";
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordInput.value.trim();
  const confirm = confirmInput.value.trim();
  const email = sessionStorage.getItem("reset_email") || "";
  const code = sessionStorage.getItem("reset_code") || "";

  if (!email || !code) {
    setStatus("Missing reset verification details. Start from Forgot Password.", true);
    return;
  }
  if (password.length < 8) {
    setStatus("Password must be at least 8 characters.", true);
    return;
  }
  if (password !== confirm) {
    setStatus("Passwords do not match.", true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, code, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Unable to reset password.");
    }

    sessionStorage.removeItem("reset_email");
    sessionStorage.removeItem("reset_code");
    setStatus("Password updated. You can sign in now.");
    setTimeout(() => {
      window.location.href = "signin.html";
    }, 900);
  } catch (error) {
    setStatus(error.message || "Unable to reset password.", true);
  }
});

initPasswordToggles();
