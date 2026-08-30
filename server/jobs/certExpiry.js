const cron = require('node-cron');
const db = require('../db/connection');
const { sendMail } = require('../utils/mailer');

// Reminder thresholds, in days before expiration. Because this runs once a
// day and checks for an exact date match, each officer gets exactly one
// email per threshold - no need to track "already sent" state anywhere.
const THRESHOLDS = [30, 14, 7, 1];

async function checkExpiringCertifications() {
  try {
    for (const days of THRESHOLDS) {
      const result = await db.query(`
        SELECT tr.id, tr.certification_name, tr.training_title,
          to_char(tr.certification_expiration, 'YYYY-MM-DD') as certification_expiration,
          u.full_name, u.email
        FROM training_records tr
        JOIN users u ON tr.officer_id = u.id
        WHERE tr.certified = true
          AND tr.certification_expiration = CURRENT_DATE + $1::int
          AND u.is_active = true
      `, [days]);

      for (const row of result.rows) {
        await sendMail({
          to: row.email,
          subject: `Certification expiring in ${days} day${days === 1 ? '' : 's'} - ${row.certification_name || row.training_title}`,
          text: `Hi ${row.full_name.split(' ')[0]},\n\n` +
            `Your certification "${row.certification_name || row.training_title}" expires on ${row.certification_expiration}.\n\n` +
            `Please arrange for renewal training if needed. Log in to the Training Portal to view your transcript.`,
        });
      }

      if (result.rows.length > 0) {
        console.log(`[certExpiry] Sent ${result.rows.length} reminder(s) at the ${days}-day threshold.`);
      }
    }
  } catch (err) {
    console.error('[certExpiry] Failed to check expiring certifications:', err.message);
  }
}

function start() {
  // Runs once a day at 7:00 AM server time.
  cron.schedule('0 7 * * *', checkExpiringCertifications);
  console.log('[certExpiry] Scheduled daily check at 7:00 AM.');
}

module.exports = { start, checkExpiringCertifications };
