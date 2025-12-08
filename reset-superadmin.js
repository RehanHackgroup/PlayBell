const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "data", "accounts.json");

async function resetPassword() {
  if (!fs.existsSync(dataPath)) {
    console.log("❌ accounts.json not found!");
    return;
  }

  const raw = fs.readFileSync(dataPath, "utf8");
  const users = JSON.parse(raw);

  const superAdmin = users.find(u => u.role === "superadmin");

  if (!superAdmin) {
    console.log("❌ Superadmin not found in accounts.json!");
    return;
  }

  const newPassword = "superadmin123";
  const hash = await bcrypt.hash(newPassword, 10);

  superAdmin.password = hash;

  fs.writeFileSync(dataPath, JSON.stringify(users, null, 2));

  console.log("✅ Superadmin password reset successful!");
  console.log("Username: superadmin");
  console.log("Password: superadmin123");
}

resetPassword();
