const fs = require("fs");
const path = require("path");
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require("./config");

// ✅ SAFE FETCH
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = (...args) =>
    import("node-fetch").then(({ default: f }) => f(...args));
}

// ✅ FORCE SAME FILE AS SERVER.JS
const ACCOUNTS_PATH = path.join(process.cwd(), "data", "accounts.json");

function readAccounts() {
  if (!fs.existsSync(ACCOUNTS_PATH)) return [];
  return JSON.parse(fs.readFileSync(ACCOUNTS_PATH, "utf8"));
}

function writeAccounts(data) {
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(data, null, 2));
}

// ✅ TELEGRAM POLLING
let offset = 0;

async function pollUpdates() {
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
          await sendMsg(chatId, "❌ You are not authorized.");
          continue;
        }

        // ✅ /users
        if (text === "/users") {
          const users = readAccounts();
          const pending = users.filter(u => u.verified === false);

          if (pending.length === 0) {
            await sendMsg(chatId, "✅ No pending users.");
          } else {
            let msg = "🕒 Pending Users:\n\n";
            pending.forEach(u => {
              msg += `👤 ${u.username} | ${u.name}\n`;
            });
            await sendMsg(chatId, msg);
          }
        }

        // ✅ /verify username
        else if (text.startsWith("/verify ")) {
          const username = text.split(" ")[1];
          const users = readAccounts();
          const user = users.find(u => u.username === username);

          if (!user) {
            await sendMsg(chatId, "❌ User not found.");
          } else {
            user.verified = true;
            writeAccounts(users);

            await sendMsg(chatId, `✅ ${username} verified successfully.`);
            console.log("✅ VERIFIED VIA TELEGRAM:", username);
          }
        }

        // ✅ /promote username admin/superadmin
        else if (text.startsWith("/promote ")) {
          const parts = text.split(" ");
          const username = parts[1];
          const role = parts[2];

          if (!["admin", "superadmin"].includes(role)) {
            await sendMsg(chatId, "❌ Role must be admin or superadmin.");
            continue;
          }

          const users = readAccounts();
          const user = users.find(u => u.username === username);

          if (!user) {
            await sendMsg(chatId, "❌ User not found.");
          } else {
            user.role = role;
            writeAccounts(users);

            await sendMsg(chatId, `✅ ${username} promoted to ${role}.`);
            console.log("✅ PROMOTED VIA TELEGRAM:", username, role);
          }
        }

        else {
          await sendMsg(
            chatId,
            "❓ Unknown command.\n\nCommands:\n/users\n/verify username\n/promote username admin"
          );
        }
      }
    } catch (err) {
      console.error("Telegram polling error:", err.message);
    }
  }, 3000);
}

// ✅ SEND TELEGRAM MESSAGE
async function sendMsg(chatId, text) {
  await fetchFn(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
}

console.log("✅ Telegram Admin Bot Started...");
console.log("✅ Using ACCOUNTS PATH:", ACCOUNTS_PATH);

pollUpdates();
