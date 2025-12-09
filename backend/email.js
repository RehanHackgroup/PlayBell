const nodemailer = require("nodemailer");

// Pehle env vars try karo
let SMTP_USER = process.env.SMTP_USER;
let SMTP_PASS = process.env.SMTP_PASS;
let APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

// Agar env vars nahi mile to local config try karo
try {
  if (!SMTP_USER || !SMTP_PASS) {
    const local = require("./email-local");
    SMTP_USER = local.SMTP_USER;
    SMTP_PASS = local.SMTP_PASS;
    if (local.APP_BASE_URL) {
      APP_BASE_URL = local.APP_BASE_URL;
    }
    console.log("📧 Using local email config (email-local.js)");
  }
} catch (e) {
  console.warn("⚠️ email-local.js not found and SMTP env vars missing.");
}

if (!SMTP_USER || !SMTP_PASS) {
  console.warn(
    "⚠️ SMTP_USER or SMTP_PASS not set. Email sending will not work until configured."
  );
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// ✅ Send email verification link
async function sendVerificationEmail(user, token) {
  if (!SMTP_USER || !SMTP_PASS) return;

  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${encodeURIComponent(
    token
  )}`;

  const mailOptions = {
    from: SMTP_USER,
    to: user.email,
    subject: "Verify your PlayBell account",
    text: `Hi ${user.name || user.username},

Please verify your email for PlayBell by clicking this link:
${verifyUrl}

If you didn't create this account, you can ignore this mail.`,
    html: `
      <p>Hi <strong>${user.name || user.username}</strong>,</p>
      <p>Please verify your email for <strong>PlayBell</strong> by clicking this button:</p>
      <p><a href="${verifyUrl}" style="padding:10px 16px;background:#4CAF50;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a></p>
      <p>Or open this link: <br/><code>${verifyUrl}</code></p>
      <p>If you didn't create this account, just ignore this email.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log("📧 Verification email sent to:", user.email);
}

// ✅ Send password reset link
async function sendPasswordResetEmail(user, token) {
  if (!SMTP_USER || !SMTP_PASS) return;

  const resetUrl = `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(
    token
  )}`;

  const mailOptions = {
    from: SMTP_USER,
    to: user.email,
    subject: "Reset your PlayBell password",
    text: `Hi ${user.name || user.username},

We received a request to reset your PlayBell password.

You can reset it using this link:
${resetUrl}

If you did not request this, please ignore this email.`,
    html: `
      <p>Hi <strong>${user.name || user.username}</strong>,</p>
      <p>We received a request to reset your <strong>PlayBell</strong> password.</p>
      <p><a href="${resetUrl}" style="padding:10px 16px;background:#FF9800;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a></p>
      <p>Or open this link: <br/><code>${resetUrl}</code></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log("📧 Password reset email sent to:", user.email);
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
