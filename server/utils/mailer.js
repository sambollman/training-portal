const nodemailer = require('nodemailer');

// Built once at startup from env vars (SMTP_HOST / SMTP_PORT / SMTP_FROM).
// If SMTP_HOST isn't set (e.g. local dev, or before IT provisions it),
// the app runs fine and just skips sending, logging that it did so.
let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '25', 10),
    secure: false, // port 25/587 - not implicit TLS; nodemailer upgrades via STARTTLS if the server offers it
    tls: { rejectUnauthorized: false }, // internal relays commonly run self-signed/no cert
  });
  console.log(`[mailer] Configured: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 25}`);
} else {
  console.warn('[mailer] SMTP_HOST not set - email notifications are disabled (will log instead of sending).');
}

/**
 * Send an email. Never throws - failures are caught and logged to the
 * console (per IT's request) so the app's core workflow never breaks
 * because a notification didn't go out.
 */
async function sendMail({ to, subject, text, html }) {
  if (!to) {
    console.warn(`[mailer] Skipped "${subject}" - no recipient email on file.`);
    return;
  }

  if (!transporter) {
    console.log(`[mailer] SMTP not configured, skipped: "${subject}" -> ${to}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'NoReply@FargoND.gov',
      to,
      subject,
      text,
      html: html || undefined,
    });
    console.log(`[mailer] Sent "${subject}" -> ${to}`);
  } catch (err) {
    console.error(`[mailer] FAILED to send "${subject}" -> ${to}:`, err.message);
  }
}

module.exports = { sendMail };
