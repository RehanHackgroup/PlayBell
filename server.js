const express = require("express");
const path = require("path");
const session = require("express-session");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcrypt");

const app = express();

/* ===== BASIC SETUP ===== */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 🔹 ab data folder bhi browser se dekh sakte ho (debug ke liye)
app.use("/data", express.static(path.join(__dirname, "data")));

app.use(bodyParser.urlencoded({ extended: false }));

app.use(
  session({
    secret: "playbell-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);

/* ===== ENSURE FOLDERS ===== */
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("data")) fs.mkdirSync("data");

/* ===== JSON HELPERS ===== */
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

/* ===== DATA ===== */
let users = readJson("accounts.json", []);
let songs = readJson("songs.json", []);
let songRequests = readJson("songRequests.json", []);

/* ===== MULTER (MP3) ===== */
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

/* ===== MIDDLEWARE ===== */
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

/* ===== ROOT ===== */
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  return res.redirect("/songs");
});

/* ===== AUTH ===== */
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = users.find((u) => u.username === username);
  if (!user) return res.render("login", { error: "❌ Username not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.render("login", { error: "❌ Wrong password" });

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  res.redirect("/songs");
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (users.find((u) => u.username === username)) {
    return res.render("register", { error: "Username already exists" });
  }

  const hash = await bcrypt.hash(password, 10);

  users.push({
    id: users.length + 1,
    username,
    password: hash,
    role: "user",
  });

  writeJson("accounts.json", users);
  res.redirect("/login");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

/* ===== SONGS (SAB ROLE KE LIYE) ===== */
app.get("/songs", requireLogin, (req, res) => {
  const visibleSongs =
    req.session.user.role === "user"
      ? songs.filter((s) => !s.muted)
      : songs;

  res.render("songs", { songs: visibleSongs });
});

/* ===== USER REQUEST PAGE ===== */
app.get("/requests", requireLogin, (req, res) => {
  if (req.session.user.role !== "user") return res.redirect("/songs");
  res.render("user-requests");
});

app.post("/request-song", requireLogin, (req, res) => {
  if (req.session.user.role !== "user") return res.redirect("/songs");

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

  res.redirect("/requests");
});

/* ===== ADMIN PANEL ===== */
app.get("/admin", requireLogin, requireAdmin, (req, res) => {
  res.render("admin", { songs });
});

app.post(
  "/admin/add-song",
  requireLogin,
  requireAdmin,
  upload.single("mp3file"),
  (req, res) => {
    const { title, artist } = req.body;
    if (!req.file || !title || !artist) return res.redirect("/admin");

    const newSong = {
      id: songs.length + 1,
      title,
      artist,
      url: "/uploads/" + req.file.filename,
      muted: false,
    };

    songs.push(newSong);
    writeJson("songs.json", songs);

    res.redirect("/admin");
  }
);

/* ===== DELETE SONG ===== */
app.post("/admin/delete-song", requireLogin, requireAdmin, (req, res) => {
  const { id } = req.body;

  const index = songs.findIndex((s) => s.id === parseInt(id));
  if (index !== -1) {
    const song = songs[index];

    // song.url = "/uploads/filename.mp3" -> uploads/filename.mp3
    const relative = song.url.replace(/^\//, "");
    const filePath = path.join(__dirname, relative);

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    songs.splice(index, 1);
    writeJson("songs.json", songs);
  }

  res.redirect("/admin");
});

/* ===== TOGGLE MUTE ===== */
app.post("/admin/toggle-mute", requireLogin, requireAdmin, (req, res) => {
  const { id } = req.body;

  const song = songs.find((s) => s.id === parseInt(id));
  if (song) {
    song.muted = !song.muted;
    writeJson("songs.json", songs);
  }

  res.redirect("/admin");
});

/* ===== ADMIN VIEW REQUESTS ===== */
app.get("/admin/requests", requireLogin, requireAdmin, (req, res) => {
  res.render("requests", { songRequests });
});

/* ===== APPROVE REQUEST ===== */
app.post(
  "/admin/approve-request",
  requireLogin,
  requireAdmin,
  upload.single("mp3file"),
  (req, res) => {
    const reqId = parseInt(req.body.id);
    const reqData = songRequests.find((r) => r.id === reqId);

    if (reqData && req.file) {
      const newSong = {
        id: songs.length + 1,
        title: reqData.title,
        artist: reqData.artist,
        url: "/uploads/" + req.file.filename,
        muted: false,
      };

      songs.push(newSong);
      writeJson("songs.json", songs);

      songRequests = songRequests.filter((r) => r.id !== reqId);
      writeJson("songRequests.json", songRequests);
    }

    res.redirect("/admin/requests");
  }
);

/* ===== REJECT REQUEST ===== */
app.post(
  "/admin/reject-request",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const reqId = parseInt(req.body.id);

    songRequests = songRequests.filter((r) => r.id !== reqId);
    writeJson("songRequests.json", songRequests);

    res.redirect("/admin/requests");
  }
);

/* ===== SUPER ADMIN ===== */
app.get("/superadmin", requireLogin, requireSuperAdmin, (req, res) => {
  res.render("superadmin", { users });
});

app.post(
  "/superadmin/change-role",
  requireLogin,
  requireSuperAdmin,
  (req, res) => {
    const { id, role } = req.body;

    const user = users.find((u) => u.id === parseInt(id));
    if (user) {
      user.role = role;
      writeJson("accounts.json", users);
    }

    res.redirect("/superadmin");
  }
);

/* ===== SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ PlayBell running on port ${PORT}`);
});
