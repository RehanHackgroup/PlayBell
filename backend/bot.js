const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");

// ✅ SAFE FETCH
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = (...args) =>
    import("node-fetch").then(({ default: f }) => f(...args));
}

// ✅ Same accounts.json as server.js
const ACCOUNTS_PATH = path.join(process.cwd(), "data", "accounts.json");

function readAccounts() {
  if (!fs.existsSync(ACCOUNTS_PATH)) return [];
  return JSON.parse(fs.readFileSync(ACCOUNTS_PATH, "utf8"));
}

function writeAccounts(data) {
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(data, null, 2));
}

// ✅ Helper: send message
async function sendMsg(chatId, text) {
  await fetchFn(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    }
  );
}

// ✅ Polling
let offset = 0;

async function pollUpdates() {
  console.log("✅ Telegram Admin Bot Started...");
  console.log("✅ Using ACCOUNTS PATH:", ACCOUNTS_PATH);

  // 🔔 Server start hone ke turant baad ek mast notification
  sendMsg(
    TELEGRAM_CHAT_ID,
    "🚀 *PlayBell Server Started*\n\n" +
      "🟢 Status: Online\n" +
      "🛠 Panel: Web + Telegram Admin Controls Ready\n" +
      "⏰ Time to manage your users, boss!"
  ).catch(() => {});

  setInterval(async () => {
    try {
      const res = await fetchFn(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}`
      );
      const data = await res.json();
      if (!data.ok) return;

      for (const update of data.result) {
        offset = update.update_id + 1;

        if (!update.message || !update.message.text) continue;

        const chatId = update.message.chat.id.toString();
        const text = update.message.text.trim();

        if (chatId !== TELEGRAM_CHAT_ID) {
          await sendMsg(chatId, "❌ *You are not authorized to use this bot.*");
          continue;
        }

        console.log("💬 Telegram command:", text);

        /* ============ HELP ============ */
        if (text === "/start" || text === "/help") {
          await sendMsg(
            chatId,
`*PlayBell Admin Bot*

Available commands:
• \`/users\` – Show *all* users (role + verified)
• \`/pusers\` – Show *pending* (not verified) users
• \`/vusers\` – Show *verified* users
• \`/verify username\` – Verify a user
• \`/unverify username\` – Remove verification
• \`/promote username admin|superadmin\` – Change role
• \`/reset username newpassword\` – Reset password
• \`/deleteuser username\` – Delete user (except superadmin)`
          );
        }

        /* ============ /users – ALL USERS ============ */
        else if (text === "/users") {
          const users = readAccounts();

          if (users.length === 0) {
            await sendMsg(chatId, "ℹ️ *No users found in database.*");
          } else {
            let msg = "*👥 All Users:*\n\n";
            users.forEach((u) => {
              msg += `• *${u.username}* (${u.name || "-"})\n`;
              msg += `   Role: \`${u.role}\` | Verified: ${
                u.verified === false ? "❌" : "✅"
              }\n\n`;
            });
            await sendMsg(chatId, msg);
          }
        }

        /* ============ /pusers – PENDING USERS ONLY ============ */
        else if (text === "/pusers") {
          const users = readAccounts();
          const pending = users.filter((u) => u.verified === false);

          if (pending.length === 0) {
            await sendMsg(chatId, "✅ *No pending users for verification.*");
          } else {
            let msg = "🕒 *Pending Users:*\n\n";
            pending.forEach((u) => {
              msg += `• *${u.username}* (${u.name || "-"})\n`;
            });
            await sendMsg(chatId, msg);
          }
        }

        /* ============ /vusers – VERIFIED USERS ONLY ============ */
        else if (text === "/vusers") {
          const users = readAccounts();
          const verified = users.filter((u) => u.verified !== false);

          if (verified.length === 0) {
            await sendMsg(chatId, "ℹ️ *No verified users yet.*");
          } else {
            let msg = "✅ *Verified Users:*\n\n";
            verified.forEach((u) => {
              msg += `• *${u.username}* (${u.name || "-"}) – \`${u.role}\`\n`;
            });
            await sendMsg(chatId, msg);
          }
        }

        /* ============ /verify username ============ */
        else if (text.startsWith("/verify ")) {
          const username = text.split(" ")[1];
          const users = readAccounts();
          const user = users.find((u) => u.username === username);

          if (!user) {
            await sendMsg(chatId, "❌ *User not found.*");
          } else {
            user.verified = true;
            writeAccounts(users);
            await sendMsg(
              chatId,
              `✅ *${username}* has been *verified* successfully.`
            );
            console.log("✅ VERIFIED VIA TELEGRAM:", username);
          }
        }

        /* ============ /unverify username ============ */
        else if (text.startsWith("/unverify ")) {
          const username = text.split(" ")[1];
          const users = readAccounts();
          const user = users.find((u) => u.username === username);

          if (!user) {
            await sendMsg(chatId, "❌ *User not found.*");
          } else {
            user.verified = false;
            writeAccounts(users);
            await sendMsg(
              chatId,
              `⚠️ *${username}* has been *unverified*.`
            );
            console.log("⚠️ UNVERIFIED VIA TELEGRAM:", username);
          }
        }

        /* ============ /promote username role ============ */
        else if (text.startsWith("/promote ")) {
          const parts = text.split(" ");
          const username = parts[1];
          const role = parts[2];

          if (!["admin", "superadmin"].includes(role)) {
            await sendMsg(
              chatId,
              "❌ Role must be `admin` or `superadmin`.\nExample: `/promote test admin`"
            );
            continue;
          }

          const users = readAccounts();
          const user = users.find((u) => u.username === username);

          if (!user) {
            await sendMsg(chatId, "❌ *User not found.*");
          } else {
            user.role = role;
            writeAccounts(users);
            await sendMsg(
              chatId,
              `✅ *${username}* has been promoted to *${role}*.`
            );
            console.log("✅ PROMOTED VIA TELEGRAM:", username, role);
          }
        }

        /* ============ /reset username newpassword ============ */
        else if (text.startsWith("/reset ")) {
          const parts = text.split(" ");
          const username = parts[1];
          const newPassword = parts[2];

          if (!username || !newPassword) {
            await sendMsg(
              chatId,
              "❌ Usage: `/reset username newpassword`"
            );
            continue;
          }

          const users = readAccounts();
          const user = users.find((u) => u.username === username);

          if (!user) {
            await sendMsg(chatId, "❌ *User not found.*");
          } else {
            const hash = await bcrypt.hash(newPassword, 10);
            user.password = hash;
            writeAccounts(users);

            await sendMsg(
              chatId,
              `✅ Password for *${username}* has been updated.`
            );
            console.log("✅ PASSWORD RESET VIA TELEGRAM:", username);
          }
        }

        /* ============ /deleteuser username ============ */
        else if (text.startsWith("/deleteuser ")) {
          const username = text.split(" ")[1];
          let users = readAccounts();
          const user = users.find((u) => u.username === username);

          if (!user) {
            await sendMsg(chatId, "❌ *User not found.*");
          } else if (user.role === "superadmin") {
            await sendMsg(chatId, "❌ Cannot delete a *superadmin*.");
          } else {
            users = users.filter((u) => u.username !== username);
            writeAccounts(users);

            await sendMsg(
              chatId,
              `🗑️ User *${username}* has been *deleted* successfully.`
            );
            console.log("🗑️ USER DELETED VIA TELEGRAM:", username);
          }
        }

        /* ============ UNKNOWN ============ */
        else {
          await sendMsg(
            chatId,
            "❓ Unknown command.\nUse `/help` to see available commands."
          );
        }
      }
    } catch (err) {
      // Optional: console.log("Telegram polling error (ignored):", err.message);
    }
  }, 3000);
}

pollUpdates();
