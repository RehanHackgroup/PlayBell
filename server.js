const express = require("express");
const path = require("path");
const session = require("express-session");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// ✅ Telegram admin bot + notifications
require("./backend/bot");
const { notifyNewUser, notifySongRequest } = require("./backend/telegram");

// ✅ Email helpers
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("./backend/email");

const app = express();

/* ================= BASIC SETUP ================= */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(bodyParser.urlencoded({ extended: false }));

app.use(session({
  secret: "playbell-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7   // ✅ 7 DAYS LOGIN STAY
  }
}));

/* ================= ENSURE FOLDERS ================= */
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("data")) fs.mkdirSync("data");

/* ================= JSON HELPERS ================= */
function readJson(fileName, defaultValue) {
  const p = path.join(__dirname, "data", fileName);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
  }
  const raw = fs.readFileSync(p, "utf8");
  if (!raw.trim()) {
    fs.writeFileSync(p, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
  }
  return JSON.parse(raw);
}

function writeJson(fileName, data) {
  const p = path.join(__dirname, "data", fileName);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

/* ================= MULTER (MP3 UPLOAD) ================= */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "audio/mpeg") cb(null, true);
    else cb(new Error("Only MP3 allowed"));
  },
});

/* ================= MIDDLEWARE ================= */
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function requireAdmin(req, res, next) {
  if (
    !req.session.user ||
    !["admin", "superadmin"].includes(req.session.user.role)
  ) {
    return res.status(403).send("Admin access only");
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "superadmin") {
    return res.status(403).send("SuperAdmin only");
  }
  next();
}

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  return res.redirect("/songs");
});

/* ================= LOGIN ================= */
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const users = readJson("accounts.json", []);
  const { username, password } = req.body;

  const user = users.find((u) => u.username === username);
  if (!user) {
    return res.render("login", { error: "❌ Username not found" });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.render("login", { error: "❌ Wrong password" });
  }

  if (user.verified === false) {
    return res.render("login", {
      error: "⚠️ Your account is not verified by admin yet.",
    });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  res.redirect("/songs");
});

/* ================= REGISTER ================= */
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const users = readJson("accounts.json", []);
  const { name, username, email, phone, password } = req.body;

  if (!name || !username || !email || !phone || !password) {
    return res.render("register", { error: "All fields are required." });
  }

  if (users.find((u) => u.username === username)) {
    return res.render("register", { error: "Username already exists" });
  }

  if (users.find((u) => u.email === email)) {
    return res.render("register", { error: "Email already in use" });
  }

  const hash = await bcrypt.hash(password, 10);
  const emailToken = crypto.randomUUID();

  const newUser = {
    id: users.length + 1,
    name,
    username,
    email,
    phone,
    password: hash,
    role: "user",
    verified: false, // admin/superadmin verification
    emailVerified: false,
    emailToken: emailToken,
    resetToken: null,
    resetTokenExpires: null,
  };

  users.push(newUser);
  writeJson("accounts.json", users);

  // Telegram notify (admin info)
  notifyNewUser(newUser).catch(() => {});

  // Email verification link
  sendVerificationEmail(newUser, emailToken).catch((err) =>
    console.error("Email verify error:", err.message)
  );

  res.render("login", {
    error:
      "✅ Account created. Check your email for verification link. Wait for admin to verify your account.",
  });
});

/* ================= VERIFY EMAIL ================= */
app.get("/verify-email", (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.render("verify-email", { status: "invalid" });
  }

  const users = readJson("accounts.json", []);
  const user = users.find((u) => u.emailToken === token);

  if (!user) {
    return res.render("verify-email", { status: "invalid" });
  }

  user.emailVerified = true;
  user.emailToken = null;
  writeJson("accounts.json", users);

  console.log("📧 Email verified for:", user.username);

  res.render("verify-email", { status: "success" });
});

/* ================= FORGOT PASSWORD (REQUEST) ================= */
app.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { error: null, success: null });
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const users = readJson("accounts.json", []);
  const user = users.find((u) => u.email === email);

  if (!user) {
    // security: always same message
    return res.render("forgot-password", {
      error: null,
      success: "If this email exists, a reset link has been sent.",
    });
  }

  const resetToken = crypto.randomUUID();
  user.resetToken = resetToken;
  user.resetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  writeJson("accounts.json", users);

  sendPasswordResetEmail(user, resetToken).catch((err) =>
    console.error("Reset email error:", err.message)
  );

  res.render("forgot-password", {
    error: null,
    success: "If this email exists, a reset link has been sent.",
  });
});

/* ================= RESET PASSWORD (PAGE) ================= */
app.get("/reset-password", (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.render("reset-password", {
      error: "Invalid or expired reset link.",
      success: null,
      token: null,
    });
  }

  const users = readJson("accounts.json", []);
  const user = users.find(
    (u) => u.resetToken === token && u.resetTokenExpires > Date.now()
  );

  if (!user) {
    return res.render("reset-password", {
      error: "Invalid or expired reset link.",
      success: null,
      token: null,
    });
  }

  res.render("reset-password", {
    error: null,
    success: null,
    token,
  });
});

/* ================= RESET PASSWORD (SUBMIT) ================= */
app.post("/reset-password", async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token) {
    return res.render("reset-password", {
      error: "Invalid reset request.",
      success: null,
      token: null,
    });
  }

  if (!newPassword || newPassword.length < 4) {
    return res.render("reset-password", {
      error: "New password must be at least 4 characters.",
      success: null,
      token,
    });
  }

  if (newPassword !== confirmPassword) {
    return res.render("reset-password", {
      error: "Passwords do not match.",
      success: null,
      token,
    });
  }

  const users = readJson("accounts.json", []);
  const user = users.find(
    (u) => u.resetToken === token && u.resetTokenExpires > Date.now()
  );

  if (!user) {
    return res.render("reset-password", {
      error: "Invalid or expired reset token.",
      success: null,
      token: null,
    });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  user.password = hash;
  user.resetToken = null;
  user.resetTokenExpires = null;

  writeJson("accounts.json", users);

  console.log("✅ Password reset via email for:", user.username);

  res.render("reset-password", {
    error: null,
    success: "✅ Password updated. You can login now.",
    token: null,
  });
});

/* ================= LOGOUT ================= */
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

/* ================= USER CHANGE PASSWORD (SELF) ================= */
app.get("/change-password", requireLogin, (req, res) => {
  res.render("change-password", { error: null, success: null });
});

app.post("/change-password", requireLogin, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const users = readJson("accounts.json", []);

  const user = users.find((u) => u.id === req.session.user.id);
  if (!user) {
    return res.render("change-password", {
      error: "User not found.",
      success: null,
    });
  }

  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match) {
    return res.render("change-password", {
      error: "❌ Old password is incorrect.",
      success: null,
    });
  }

  if (!newPassword || newPassword.length < 4) {
    return res.render("change-password", {
      error: "❌ New password must be at least 4 characters.",
      success: null,
    });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  user.password = hash;
  writeJson("accounts.json", users);

  console.log("✅ User changed password:", user.username);

  res.render("change-password", {
    error: null,
    success: "✅ Password changed successfully.",
  });
});

/* ================= SONGS ================= */
app.get("/songs", requireLogin, (req, res) => {
  const songs = readJson("songs.json", []);
  const visibleSongs =
    req.session.user.role === "user"
      ? songs.filter((s) => !s.muted)
      : songs;

  res.render("songs", { songs: visibleSongs });
});

/* ================= USER REQUEST ================= */
app.get("/requests", requireLogin, (req, res) => {
  if (req.session.user.role !== "user") return res.redirect("/songs");
  res.render("user-requests");
});

app.post("/request-song", requireLogin, (req, res) => {
  const songRequests = readJson("songRequests.json", []);
  const { title, artist } = req.body;

  if (!title || !artist) return res.redirect("/requests");

  const newReq = {
    id: songRequests.length + 1,
    title,
    artist,
    requestedBy: req.session.user.username,
  };

  songRequests.push(newReq);
  writeJson("songRequests.json", songRequests);

  // Telegram pe song request notification
  notifySongRequest(newReq).catch(() => {});

  res.redirect("/requests");
});

/* ================= ADMIN PANEL ================= */
app.get("/admin", requireLogin, requireAdmin, (req, res) => {
  const songs = readJson("songs.json", []);
  res.render("admin", { songs });
});

app.post(
  "/admin/add-song",
  requireLogin,
  requireAdmin,
  upload.single("mp3file"),
  (req, res) => {
    const songs = readJson("songs.json", []);
    const { title, artist } = req.body;

    if (!req.file || !title || !artist) return res.redirect("/admin");

    songs.push({
      id: songs.length + 1,
      title,
      artist,
      url: "/uploads/" + req.file.filename,
      muted: false,
    });

    writeJson("songs.json", songs);
    res.redirect("/admin");
  }
);

app.post("/admin/toggle-mute", requireLogin, requireAdmin, (req, res) => {
  const songs = readJson("songs.json", []);
  const id = parseInt(req.body.id);

  const song = songs.find((s) => s.id === id);
  if (song) song.muted = !song.muted;

  writeJson("songs.json", songs);
  res.redirect("/admin");
});

app.post("/admin/delete-song", requireLogin, requireAdmin, (req, res) => {
  const songs = readJson("songs.json", []);
  const id = parseInt(req.body.id);

  const idx = songs.findIndex((s) => s.id === id);
  if (idx !== -1) {
    const relative = songs[idx].url.replace(/^\//, "");
    const filePath = path.join(__dirname, relative);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    songs.splice(idx, 1);
  }

  writeJson("songs.json", songs);
  res.redirect("/admin");
});

/* ================= ADMIN REQUESTS ================= */
app.get("/admin/requests", requireLogin, requireAdmin, (req, res) => {
  const songRequests = readJson("songRequests.json", []);
  res.render("requests", { songRequests });
});

app.post(
  "/admin/approve-request",
  requireLogin,
  requireAdmin,
  upload.single("mp3file"),
  (req, res) => {
    const songs = readJson("songs.json", []);
    const songRequests = readJson("songRequests.json", []);
    const reqId = parseInt(req.body.id);

    const reqData = songRequests.find((r) => r.id === reqId);

    if (reqData && req.file) {
      songs.push({
        id: songs.length + 1,
        title: reqData.title,
        artist: reqData.artist,
        url: "/uploads/" + req.file.filename,
        muted: false,
      });
    }

    writeJson("songs.json", songs);
    writeJson(
      "songRequests.json",
      songRequests.filter((r) => r.id !== reqId)
    );

    res.redirect("/admin/requests");
  }
);
// ❌ Reject song request (sirf list se remove karega)
app.post(
  "/admin/reject-request",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const songRequests = readJson("songRequests.json", []);
    const reqId = parseInt(req.body.id);

    const newList = songRequests.filter((r) => r.id !== reqId);
    writeJson("songRequests.json", newList);

    console.log("🗑️ Rejected song request:", reqId);

    res.redirect("/admin/requests");
  }
);

/* ================= SUPER ADMIN ================= */
app.get("/superadmin", requireLogin, requireSuperAdmin, (req, res) => {
  const users = readJson("accounts.json", []);
  res.render("superadmin", { users });
});

app.post(
  "/superadmin/change-role",
  requireLogin,
  requireSuperAdmin,
  (req, res) => {
    const users = readJson("accounts.json", []);
    const { id, role } = req.body;

    const user = users.find((u) => u.id === parseInt(id));
    if (user) user.role = role;

    writeJson("accounts.json", users);
    res.redirect("/superadmin");
  }
);

app.post(
  "/superadmin/toggle-verify",
  requireLogin,
  requireSuperAdmin,
  (req, res) => {
    const users = readJson("accounts.json", []);
    const { id } = req.body;

    const user = users.find((u) => u.id === parseInt(id));
    if (user) user.verified = !user.verified;

    writeJson("accounts.json", users);
    res.redirect("/superadmin");
  }
);

app.post(
  "/superadmin/reset-password",
  requireLogin,
  requireSuperAdmin,
  async (req, res) => {
    const { id, newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
      return res.redirect("/superadmin");
    }

    const users = readJson("accounts.json", []);
    const user = users.find((u) => u.id === parseInt(id));

    if (user) {
      const hash = await bcrypt.hash(newPassword, 10);
      user.password = hash;
      writeJson("accounts.json", users);
      console.log("✅ Password reset by SuperAdmin:", user.username);
    }

    res.redirect("/superadmin");
  }
);

app.post(
  "/superadmin/delete-user",
  requireLogin,
  requireSuperAdmin,
  (req, res) => {
    const { id } = req.body;
    let users = readJson("accounts.json", []);

    const user = users.find((u) => u.id === parseInt(id));
    if (user && user.role === "superadmin") {
      return res.redirect("/superadmin");
    }

    users = users.filter((u) => u.id !== parseInt(id));
    writeJson("accounts.json", users);

    console.log("🗑️ User deleted by SuperAdmin:", user && user.username);

    res.redirect("/superadmin");
  }
);

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ PlayBell running on port ${PORT}`);
});
