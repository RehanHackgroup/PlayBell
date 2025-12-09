const axios = require("axios");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_BASE_URL = process.env.APP_BASE_URL || "http://playbell.swiftbyte.dev";

if (!RESEND_API_KEY) {
  console.warn("⚠️ RESEND_API_KEY not set. Emails will not be sent.");
}

async function sendVerificationEmail(user, token) {
  if (!RESEND_API_KEY) return;

  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;

  const payload = {
    from: "PlayBell <onboarding@resend.dev>",
    to: user.email,
    subject: "Verify your PlayBell account",
    html: `
      <h2>Hello ${user.name || user.username}</h2>
      <p>Click the button below to verify your PlayBell account:</p>
      <a href="${verifyUrl}" style="padding:12px 18px;background:#00ffcc;color:#000;text-decoration:none;border-radius:6px;font-weight:bold;">Verify Account</a>
      <p>Or open this link:</p>
      <code>${verifyUrl}</code>
    `
  };

  try {
    await axios.post("https://api.resend.com/emails", payload, {
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    console.log("📧 Verification email sent to:", user.email);
  } catch (err) {
    console.error("❌ Verification email failed:", err.response?.data || err.message);
  }
}

async function sendPasswordResetEmail(user, token) {
  if (!RESEND_API_KEY) return;

  const resetUrl = `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;

  const payload = {
    from: "PlayBell <onboarding@resend.dev>",
    to: user.email,
    subject: "Reset your PlayBell password",
    html: `
      <h2>Hello ${user.name || user.username}</h2>
      <p>You requested a password reset for PlayBell.</p>
      <a href="${resetUrl}" style="padding:12px 18px;background:#ff9800;color:#000;text-decoration:none;border-radius:6px;font-weight:bold;">Reset Password</a>
      <p>Or open this link:</p>
      <code>${resetUrl}</code>
    `
  };

  try {
    await axios.post("https://api.resend.com/emails", payload, {
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    console.log("📧 Password reset email sent to:", user.email);
  } catch (err) {
    console.error("❌ Password reset email failed:", err.response?.data || err.message);
  }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
