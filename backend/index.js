require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 4000;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const LOGINS_FILE = path.join(DATA_DIR, "logins.json");
const RESET_CODES_FILE = path.join(DATA_DIR, "reset-codes.json");
const CONTACTS_FILE = path.join(DATA_DIR, "contacts.json");
const NEWSLETTER_FILE = path.join(DATA_DIR, "newsletter.json");
const GPS_TRACKS_FILE = path.join(DATA_DIR, "gps-tracks.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(LOGINS_FILE)) {
  fs.writeFileSync(LOGINS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(RESET_CODES_FILE)) {
  fs.writeFileSync(RESET_CODES_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(CONTACTS_FILE)) {
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(NEWSLETTER_FILE)) {
  fs.writeFileSync(NEWSLETTER_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(GPS_TRACKS_FILE)) {
  fs.writeFileSync(GPS_TRACKS_FILE, JSON.stringify([], null, 2));
}

const readUsers = () => {
  const raw = fs.readFileSync(USERS_FILE, "utf8");
  return JSON.parse(raw || "[]");
};

const writeUsers = (users) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

const readLogins = () => {
  const raw = fs.readFileSync(LOGINS_FILE, "utf8");
  return JSON.parse(raw || "[]");
};

const writeLogins = (logins) => {
  fs.writeFileSync(LOGINS_FILE, JSON.stringify(logins, null, 2));
};

const readJsonArray = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw || "[]");
};

const writeJsonArray = (filePath, value) => {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const gpsTracksStore = (() => {
  try {
    return readJsonArray(GPS_TRACKS_FILE);
  } catch (_) {
    return [];
  }
})();

const readGpsTracks = () => gpsTracksStore;

const writeGpsTracks = (tracks) => {
  // Keep GPS data in memory during runtime to avoid file-write-triggered frontend auto reload.
  // This is intentional for smoother live tracking UX in local development.
  if (!Array.isArray(tracks)) return;
  const snapshot = tracks.slice(0, 5000);
  gpsTracksStore.length = 0;
  snapshot.forEach((item) => gpsTracksStore.push(item));
};

const normalizeTrackingCode = (code) =>
  typeof code === "string" ? code.trim().toUpperCase() : "";

const createTrackingCode = (existingCodes) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let value = "";
    for (let i = 0; i < 6; i += 1) {
      value += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existingCodes.has(value)) {
      return value;
    }
  }
  return `T${Date.now().toString(36).slice(-5).toUpperCase()}`;
};

const recordLogin = (entry) => {
  const logins = readLogins();
  logins.unshift({
    id: `login_${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...entry
  });
  writeLogins(logins.slice(0, 200));
};

const ensureAdmin = async () => {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "Admin@123";
  const users = readUsers();
  const existing = users.find((u) => u.email === email);
  if (existing) {
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users.push({
    id: `admin_${Date.now()}`,
    email,
    passwordHash,
    role: "ADMIN",
    createdAt: new Date().toISOString()
  });
  writeUsers(users);
  console.log("Admin created:", email);
};

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change_this_secret",
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: SESSION_MAX_AGE_MS
    }
  })
);

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const users = readUsers();
  const user = users.find((u) => u.id === req.session.userId);
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Backend running" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/signup", async (req, res) => {
  const { email, password, name } = req.body || {};
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const normalizedName = trimmedName.toLowerCase();

  if (!trimmedEmail || !password || !trimmedName) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  const users = readUsers();
  if (users.some((u) => (u.email || "").toLowerCase() === trimmedEmail.toLowerCase())) {
    return res.status(409).json({ error: "Email already in use." });
  }
  if (users.some((u) => typeof u.name === "string" && u.name.trim().toLowerCase() === normalizedName)) {
    return res.status(409).json({ error: "Username already in use." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: `user_${Date.now()}`,
    email: trimmedEmail,
    name: trimmedName,
    passwordHash,
    role: "USER",
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);
  req.session.userId = user.id;
  req.session.cookie.maxAge = SESSION_MAX_AGE_MS;
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.post("/api/auth/signin", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const users = readUsers();
  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials." });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials." });
  }
  req.session.userId = user.id;
  req.session.cookie.maxAge = SESSION_MAX_AGE_MS;
  recordLogin({ name: user.name || null, email: user.email, role: user.role, source: "sign-in" });
  res.json({ id: user.id, name: user.name || null, email: user.email, role: user.role });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ status: "ok" });
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const users = readUsers();
  const user = users.find((u) => u.id === req.session.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ id: user.id, name: user.name || null, email: user.email, role: user.role });
});

app.post("/api/auth/forgot-password", (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) {
    return res.status(400).json({ error: "Email is required." });
  }

  const users = readUsers();
  const user = users.find((u) => (u.email || "").toLowerCase() === normalizedEmail);
  if (!user) {
    return res.status(404).json({ error: "Email not found." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const codes = readJsonArray(RESET_CODES_FILE).filter((item) => item.email !== normalizedEmail);
  codes.unshift({
    id: `reset_${Date.now()}`,
    email: normalizedEmail,
    code,
    expiresAt,
    createdAt: new Date().toISOString()
  });
  writeJsonArray(RESET_CODES_FILE, codes.slice(0, 500));

  // For local/testing setup, return the code in response.
  res.json({ status: "ok", message: "Verification code sent.", code });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, code, password } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const typedCode = typeof code === "string" ? code.trim() : "";
  const newPassword = typeof password === "string" ? password : "";

  if (!normalizedEmail || !typedCode || !newPassword) {
    return res.status(400).json({ error: "Email, code, and new password are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const codes = readJsonArray(RESET_CODES_FILE);
  const now = Date.now();
  const entry = codes.find((item) => item.email === normalizedEmail && item.code === typedCode && item.expiresAt > now);
  if (!entry) {
    return res.status(400).json({ error: "Invalid or expired verification code." });
  }

  const users = readUsers();
  const userIndex = users.findIndex((u) => (u.email || "").toLowerCase() === normalizedEmail);
  if (userIndex < 0) {
    return res.status(404).json({ error: "User not found." });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  users[userIndex].passwordHash = passwordHash;
  users[userIndex].updatedAt = new Date().toISOString();
  writeUsers(users);

  const filteredCodes = codes.filter((item) => !(item.email === normalizedEmail && item.code === typedCode));
  writeJsonArray(RESET_CODES_FILE, filteredCodes);

  res.json({ status: "ok", message: "Password updated successfully." });
});

app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body || {};
  const safeName = typeof name === "string" ? name.trim() : "";
  const safeEmail = typeof email === "string" ? email.trim() : "";
  const safeMessage = typeof message === "string" ? message.trim() : "";

  if (!safeName || !safeEmail || !safeMessage) {
    return res.status(400).json({ error: "Name, email, and message are required." });
  }

  const contacts = readJsonArray(CONTACTS_FILE);
  contacts.unshift({
    id: `contact_${Date.now()}`,
    name: safeName,
    email: safeEmail,
    message: safeMessage,
    createdAt: new Date().toISOString()
  });
  writeJsonArray(CONTACTS_FILE, contacts.slice(0, 1000));

  res.json({ status: "ok" });
});

app.post("/api/newsletter", (req, res) => {
  const { email } = req.body || {};
  const safeEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!safeEmail) {
    return res.status(400).json({ error: "Email is required." });
  }

  const list = readJsonArray(NEWSLETTER_FILE);
  if (list.some((item) => item.email === safeEmail)) {
    return res.json({ status: "ok", message: "Already subscribed." });
  }

  list.unshift({
    id: `sub_${Date.now()}`,
    email: safeEmail,
    createdAt: new Date().toISOString()
  });
  writeJsonArray(NEWSLETTER_FILE, list.slice(0, 5000));

  res.json({ status: "ok", message: "Subscribed." });
});

app.get("/api/gps/my-active", requireAuth, (req, res) => {
  const tracks = readGpsTracks();
  const active = tracks.find((item) => item.userId === req.session.userId && item.active);
  if (!active) {
    return res.json({ active: false });
  }
  return res.json({
    active: true,
    code: active.code,
    startedAt: active.startedAt,
    updatedAt: active.updatedAt || active.startedAt,
    location: active.lastLocation || null
  });
});

app.post("/api/gps/start", requireAuth, (req, res) => {
  const tracks = readGpsTracks();
  const existing = tracks.find((item) => item.userId === req.session.userId && item.active);
  if (existing) {
    return res.json({
      code: existing.code,
      active: true,
      startedAt: existing.startedAt,
      updatedAt: existing.updatedAt || existing.startedAt
    });
  }

  const existingCodes = new Set(tracks.map((item) => item.code));
  const code = createTrackingCode(existingCodes);
  const now = new Date().toISOString();
  tracks.unshift({
    id: `gps_${Date.now()}`,
    userId: req.session.userId,
    code,
    active: true,
    startedAt: now,
    updatedAt: now,
    canceledAt: null,
    lastLocation: null
  });
  writeGpsTracks(tracks);
  res.json({ code, active: true, startedAt: now, updatedAt: now });
});

app.post("/api/gps/update", requireAuth, (req, res) => {
  const { code, lat, lng, accuracy } = req.body || {};
  const normalizedCode = normalizeTrackingCode(code);
  if (!normalizedCode) {
    return res.status(400).json({ error: "Tracking code is required." });
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  const locationAccuracy = Number(accuracy);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "Valid latitude and longitude are required." });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "Location values are out of range." });
  }

  const tracks = readGpsTracks();
  const track = tracks.find((item) => item.code === normalizedCode);
  if (!track) {
    return res.status(404).json({ error: "Tracking code not found." });
  }
  if (track.userId !== req.session.userId) {
    return res.status(403).json({ error: "This tracking code belongs to another user." });
  }
  if (!track.active) {
    return res.status(409).json({ error: "Tracking is canceled." });
  }

  track.updatedAt = new Date().toISOString();
  track.lastLocation = {
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(locationAccuracy) ? locationAccuracy : null,
    updatedAt: track.updatedAt
  };
  writeGpsTracks(tracks);
  res.json({ status: "ok", updatedAt: track.updatedAt });
});

app.get("/api/gps/track/:code", requireAuth, (req, res) => {
  const normalizedCode = normalizeTrackingCode(req.params.code);
  if (!normalizedCode) {
    return res.status(400).json({ error: "Tracking code is required." });
  }
  const tracks = readGpsTracks();
  const track = tracks.find((item) => item.code === normalizedCode);
  if (!track) {
    return res.status(404).json({ error: "Tracking code not found." });
  }
  if (!track.active) {
    return res.json({
      code: track.code,
      active: false,
      canceledAt: track.canceledAt || track.updatedAt || null
    });
  }

  return res.json({
    code: track.code,
    active: true,
    startedAt: track.startedAt,
    updatedAt: track.updatedAt || track.startedAt,
    location: track.lastLocation || null
  });
});

app.post("/api/gps/cancel", requireAuth, (req, res) => {
  const { code } = req.body || {};
  const normalizedCode = normalizeTrackingCode(code);
  if (!normalizedCode) {
    return res.status(400).json({ error: "Tracking code is required." });
  }
  const tracks = readGpsTracks();
  const track = tracks.find((item) => item.code === normalizedCode);
  if (!track) {
    return res.status(404).json({ error: "Tracking code not found." });
  }
  if (track.userId !== req.session.userId) {
    return res.status(403).json({ error: "This tracking code belongs to another user." });
  }
  if (!track.active) {
    return res.json({ status: "ok", active: false });
  }

  const now = new Date().toISOString();
  track.active = false;
  track.canceledAt = now;
  track.updatedAt = now;
  writeGpsTracks(tracks);
  res.json({ status: "ok", active: false, canceledAt: now });
});

const renderAdminLogin = (error = "") => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Login</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0f1214; color: #f6f1ea; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      .card { background: #171c22; padding: 28px; border-radius: 16px; width: min(360px, 90vw); box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
      h1 { margin: 0 0 16px; font-size: 1.4rem; }
      label { display: grid; gap: 6px; margin-bottom: 14px; }
      input { padding: 10px 12px; border-radius: 10px; border: 1px solid #2b313a; background: #0c0f13; color: #f6f1ea; }
      button { width: 100%; padding: 10px 12px; border-radius: 999px; border: none; background: #ff6f3c; color: #1b1a17; font-weight: 700; cursor: pointer; }
      .error { color: #f88b8b; margin-top: 10px; min-height: 18px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Admin Login</h1>
      <form method="POST" action="/admin/login">
        <label>Email <input type="email" name="email" required /></label>
        <label>Password <input type="password" name="password" required /></label>
        <button type="submit">Sign In</button>
      </form>
      <div class="error">${error}</div>
    </div>
  </body>
  </html>
`;

const renderAdminDashboard = ({ users = [], logins = [], adminEmail = "" } = {}) => {
  const adminUser = users.find((u) => u.role === "ADMIN") || null;
  const adminCreated = adminUser ? new Date(adminUser.createdAt).toLocaleString() : "-";
  const adminDisplayEmail = adminEmail || "-";
  const adminPasswordMask = adminEmail ? "********" : "-";
  const signupUsers = users.filter((u) => u.role === "USER");
  const signinLogins = logins.filter((l) => l.source === "sign-in");
  const adminLogins = logins.filter((l) => l.source === "admin-login");
  const lastAdminLogin = adminLogins.length ? new Date(adminLogins[0].createdAt).toLocaleString() : "-";

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Dashboard</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0f1214; color: #f6f1ea; margin: 0; padding: 96px 32px 32px; }
      header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
      h1 { margin: 0; font-size: 1.6rem; }
      a, button { color: #f6f1ea; text-decoration: none; }
      .logout { background: #1f262e; border: 1px solid #2b313a; padding: 8px 14px; border-radius: 999px; }
      .admin-nav { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; background: rgba(23, 28, 34, 0.9); border: 1px solid #2b313a; padding: 10px 16px; border-radius: 999px; box-shadow: 0 12px 30px rgba(0,0,0,0.35); z-index: 10; }
      .admin-nav button { background: transparent; border: none; color: #f6f1ea; font-weight: 600; font-size: 0.95rem; cursor: pointer; padding: 6px 10px; border-radius: 999px; }
      .admin-nav button.active { background: #ff6f3c; color: #1b1a17; }
      section { display: none; }
      section.active { display: block; }
      .info-card { background: #171c22; padding: 20px; border-radius: 14px; border: 1px solid #262c34; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; background: #171c22; border-radius: 14px; overflow: hidden; }
      th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #262c34; }
      th { background: #1f262e; font-weight: 600; }
      tr:last-child td { border-bottom: none; }
      .muted { color: #a9b0bb; }
    </style>
  </head>
  <body>
    <nav class="admin-nav">
      <button data-tab="admin" class="active">Admin Login</button>
      <button data-tab="signup">Sign Up</button>
      <button data-tab="signin">Sign In</button>
    </nav>

    <header>
      <h1>Admin Dashboard</h1>
      <form method="POST" action="/admin/logout">
        <button class="logout" type="submit">Logout</button>
      </form>
    </header>

    <section id="tab-admin" class="active">
      <div class="info-card">
        <h2>Admin Login Data</h2>
        <p><strong>Email:</strong> ${adminDisplayEmail}</p>
        <p><strong>Password:</strong> ${adminPasswordMask}</p>
        <p class="muted"><strong>Created:</strong> ${adminCreated}</p>
        <p class="muted"><strong>Last Admin Login:</strong> ${lastAdminLogin}</p>
      </div>
    </section>

    <section id="tab-signup">
      <h2>Sign Up Data</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Password</th><th>Created</th></tr>
        </thead>
        <tbody id="signup-rows">
          ${signupUsers.map((u) => `<tr><td>${u.name || "-"}</td><td>${u.email}</td><td>********</td><td>${new Date(u.createdAt).toLocaleString()}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>

    <section id="tab-signin">
      <h2>Sign In Data</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Password</th><th>Time</th></tr>
        </thead>
        <tbody id="signin-rows">
          ${signinLogins.map((l) => `<tr><td>${l.name || "-"}</td><td>${l.email || "-"}</td><td>********</td><td>${new Date(l.createdAt).toLocaleString()}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>

    <script>
      const buttons = document.querySelectorAll('.admin-nav button');
      const sections = {
        admin: document.getElementById('tab-admin'),
        signup: document.getElementById('tab-signup'),
        signin: document.getElementById('tab-signin')
      };
      const signupBody = document.getElementById('signup-rows');
      const signinBody = document.getElementById('signin-rows');

      const activateTab = (tab) => {
        buttons.forEach((b) => b.classList.remove('active'));
        const btn = document.querySelector(".admin-nav button[data-tab='" + tab + "']");
        if (btn) btn.classList.add('active');
        Object.values(sections).forEach((s) => s.classList.remove('active'));
        if (sections[tab]) sections[tab].classList.add('active');
      };

      const renderRows = (tbody, rows, type) => {
        if (!tbody) return;
        if (type === 'signup') {
          tbody.innerHTML = rows.map((u) =>
            '<tr>' +
              '<td>' + (u.name || '-') + '</td>' +
              '<td>' + (u.email || '-') + '</td>' +
              '<td>********</td>' +
              '<td>' + new Date(u.createdAt).toLocaleString() + '</td>' +
            '</tr>'
          ).join('');
        } else {
          tbody.innerHTML = rows.map((l) =>
            '<tr>' +
              '<td>' + (l.name || '-') + '</td>' +
              '<td>' + (l.email || '-') + '</td>' +
              '<td>********</td>' +
              '<td>' + new Date(l.createdAt).toLocaleString() + '</td>' +
            '</tr>'
          ).join('');
        }
      };

      const refreshData = async () => {
        try {
          const res = await fetch('/admin/data', { credentials: 'same-origin' });
          if (!res.ok) return;
          const data = await res.json();
          renderRows(signupBody, data.users || [], 'signup');
          renderRows(signinBody, data.logins || [], 'signin');
        } catch (err) {
          // ignore transient errors
        }
      };

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab;
          activateTab(tab);
        });
      });

      setInterval(refreshData, 5000);
      refreshData();
    </script>
  </body>
  </html>
  `;
};

app.get("/admin/login", (req, res) => {
  res.send(renderAdminLogin());
});

app.post("/admin/login", express.urlencoded({ extended: false }), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.send(renderAdminLogin("Email and password are required."));
  }
  const users = readUsers();
  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.send(renderAdminLogin("Invalid credentials."));
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok || user.role !== "ADMIN") {
    return res.send(renderAdminLogin("Invalid admin credentials."));
  }
  req.session.userId = user.id;
  recordLogin({ name: user.name || null, email: user.email, role: user.role, source: "admin-login" });
  res.redirect("/admin");
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

app.get("/admin", requireAdmin, (req, res) => {
  const users = readUsers();
  const logins = readLogins();
  const adminEmail = process.env.ADMIN_EMAIL || "";
  res.send(renderAdminDashboard({ users, logins, adminEmail }));
});


app.get("/admin/data", requireAdmin, (req, res) => {
  const users = readUsers().filter((u) => u.role === "USER");
  const logins = readLogins().filter((l) => l.source === "sign-in");
  res.json({ users, logins });
});

ensureAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
});
