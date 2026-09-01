const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { isDuplicateKeyError } = require('../db/errors');

// Shared by POST / and POST /enroll — looks up a training along with how
// many people are currently enrolled in it, so callers can check whether
// a seat is actually available before creating an enrollment.
async function getTrainingWithEnrolledCount(trainingId) {
  return db('trainings as t')
    .select(
      't.*',
      db.raw("(SELECT COUNT(*) FROM enrollment_requests er2 WHERE er2.training_id = t.id AND er2.status IN ('approved', 'enrolled')) as enrolled_count")
    )
    .where({ 't.id': trainingId, 't.is_archived': false })
    .first();
}

// GET /api/requests - officer sees their own requests
router.get('/', requireAuth, async (req, res) => {
  try {
    const requests = await db('enrollment_requests as er')
      .join('trainings as t', 'er.training_id', 't.id')
      .select(
        'er.*',
        't.title',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
        db.raw("CONVERT(varchar(10), t.end_date, 23) as end_date"),
        't.location', 't.category',
        // Converted to plain text for the same reason as in
        // trainings.js's TRAINING_COLUMNS — tedious returns TIME
        // columns as Date objects, which the frontend's naive
        // t.split(':') parser mishandles.
        db.raw("CONVERT(varchar(8), t.start_time, 108) as start_time"),
        db.raw("(SELECT TOP 1 comment FROM approval_steps WHERE enrollment_request_id = er.id AND decision = 'returned' ORDER BY decided_at DESC) as return_comment"),
        db.raw("(SELECT TOP 1 approver_name FROM approval_steps WHERE enrollment_request_id = er.id AND decision = 'returned' ORDER BY decided_at DESC) as returned_by")
      )
      .where('er.officer_id', req.user.id)
      .orderBy('t.session_date', 'asc');

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// GET /api/requests/pending - supervisor sees pending requests for their unit
router.get('/pending', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const requests = await db('enrollment_requests as er')
      .join('trainings as t', 'er.training_id', 't.id')
      .join('users as u', 'er.officer_id', 'u.id')
      .select(
        'er.*',
        't.title',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
        db.raw("CONVERT(varchar(10), t.end_date, 23) as end_date"),
        't.location', 't.category',
        'u.full_name', 'u.badge_number', 'u.unit'
      )
      .where({ 'er.status': 'pending', 'er.supervisor_id': req.user.id })
      .orderBy('er.created_at', 'asc');

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

router.get('/all', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const fullHistory = req.query.fullHistory === 'true';

    // Matches "recent enough to show by default": no session date yet,
    // within the last 90 days, or still actively moving through the
    // approval chain regardless of age.
    const applyRecentFilter = (builder) => {
      builder
        .whereNull('t.session_date')
        .orWhere('t.session_date', '>=', db.raw('DATEADD(day, -90, CAST(GETDATE() AS DATE))'))
        .orWhereNot('er.chain_status', 'complete');
    };

    const baseColumns = [
      'er.*',
      't.title',
      db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
      db.raw("CONVERT(varchar(10), t.end_date, 23) as end_date"),
      't.location', 't.category',
      'u.full_name', 'u.badge_number', 'u.unit',
    ];

    let query;
    if (req.user.role === 'coordinator') {
      query = db('enrollment_requests as er')
        .join('trainings as t', 'er.training_id', 't.id')
        .join('users as u', 'er.officer_id', 'u.id')
        .select(...baseColumns)
        .orderBy('er.created_at', 'desc')
        .limit(1000);

      if (!fullHistory) query = query.where(applyRecentFilter);
    } else {
      query = db('enrollment_requests as er')
        .distinct()
        .join('trainings as t', 'er.training_id', 't.id')
        .join('users as u', 'er.officer_id', 'u.id')
        .leftJoin('approval_steps as ap', 'ap.enrollment_request_id', 'er.id')
        .select(...baseColumns)
        .where((builder) => {
          builder.where('er.supervisor_id', req.user.id).orWhere('ap.approver_id', req.user.id);
        })
        .orderBy('er.created_at', 'desc')
        .limit(1000);

      if (!fullHistory) query = query.andWhere(applyRecentFilter);
    }

    const requests = await query;
    res.json({ requests, fullHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// POST /api/requests - officer submits a self-request
router.post('/', requireAuth, async (req, res) => {
  const { training_id } = req.body;

  if (!training_id) {
    return res.status(400).json({ error: 'training_id is required' });
  }

  try {
    const training = await getTrainingWithEnrolledCount(training_id);

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    // Note: seat_capacity is null when a training has no seat limit — a
    // training with no limit should never report "full". The original
    // version compared enrolled_count >= seat_capacity unconditionally,
    // which in JS treats null as 0 for a >= comparison, meaning any
    // no-seat-limit training would immediately (and incorrectly) reject
    // every self-request. Fixed here to only enforce the cap when one
    // actually exists.
    if (training.seat_capacity !== null && training.enrolled_count >= training.seat_capacity) {
      return res.status(400).json({ error: 'Training is full' });
    }

    const officer = await db('users').where({ id: req.user.id }).first();
    const supervisor_id = officer.supervisor_id;

    const [request] = await db('enrollment_requests')
      .insert({
        training_id,
        officer_id: req.user.id,
        supervisor_id,
        request_type: 'self_requested',
        status: 'pending',
      })
      .returning('*');

    res.status(201).json({ request });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(400).json({ error: 'You are already enrolled in this training' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// POST /api/requests/enroll - supervisor directly enrolls an officer
router.post('/enroll', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const { training_id, officer_id } = req.body;

  if (!training_id || !officer_id) {
    return res.status(400).json({ error: 'training_id and officer_id are required' });
  }

  try {
    const training = await getTrainingWithEnrolledCount(training_id);

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    // Same no-seat-limit fix as the self-request route above.
    if (training.seat_capacity !== null && training.enrolled_count >= training.seat_capacity) {
      return res.status(400).json({ error: 'Training is full' });
    }

    const officer = await db('users').select('full_name', 'email').where({ id: officer_id }).first();

    const [request] = await db('enrollment_requests')
      .insert({
        training_id,
        officer_id,
        supervisor_id: req.user.id,
        request_type: 'supervisor_enrolled',
        status: 'approved',
      })
      .returning('*');

    if (officer) {
      sendMail({
        to: officer.email,
        subject: `You've been enrolled in a training - ${training.title}`,
        text: `Hi ${officer.full_name.split(' ')[0]},\n\n` +
          `${req.user.full_name} has enrolled you in "${training.title}"` +
          (training.session_date ? ` on ${new Date(training.session_date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}` : '') +
          `.\n\nLog in to the Training Portal for details.`,
      });
    }

    res.status(201).json({ request });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(400).json({ error: 'Officer is already enrolled in this training' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to enroll officer' });
  }
});

// PATCH /api/requests/:id/approve
router.patch('/:id/approve', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    // Note: no .returning() — enrollment_requests has the same AFTER
    // UPDATE trigger (updated_at) as users and trainings, so OUTPUT
    // isn't allowed here. See the note in db/connection.js.
    const affectedRows = await db('enrollment_requests')
      .where({ id: req.params.id, status: 'pending' })
      .update({ status: 'approved', acted_on_at: db.fn.now(), acted_on_by: req.user.id });

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Request not found or already acted on' });
    }

    const request = await db('enrollment_requests').where({ id: req.params.id }).first();
    res.json({ request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// PATCH /api/requests/:id/deny
router.patch('/:id/deny', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  const { denial_note } = req.body;

  try {
    // Same trigger restriction as /approve above — no .returning().
    const affectedRows = await db('enrollment_requests')
      .where({ id: req.params.id, status: 'pending' })
      .update({ status: 'denied', denial_note: denial_note || null, acted_on_at: db.fn.now(), acted_on_by: req.user.id });

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Request not found or already acted on' });
    }

    const request = await db('enrollment_requests').where({ id: req.params.id }).first();
    res.json({ request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deny request' });
  }
});

// PATCH /api/requests/:id/attendance
router.patch('/:id/attendance', requireAuth, requireRole('supervisor', 'coordinator', 'instructor'), async (req, res) => {
  const { attended } = req.body;

  if (typeof attended !== 'boolean') {
    return res.status(400).json({ error: 'attended must be true or false' });
  }

  try {
    // Same trigger restriction as above — no .returning().
    const affectedRows = await db('enrollment_requests').where({ id: req.params.id }).update({ attended });

    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = await db('enrollment_requests').where({ id: req.params.id }).first();

    if (attended) {
      const training = await db('trainings').where({ id: request.training_id }).first();

      const existing = await db('training_records').where({ enrollment_request_id: request.id }).first();

      if (!existing && training) {
        await db('training_records').insert({
          officer_id: request.officer_id,
          training_title: training.title,
          training_date: training.session_date,
          end_date: training.end_date || null,
          location: training.location || null,
          instructor: training.instructor || null,
          hours: training.duration_hours,
          source: 'portal',
          enrollment_request_id: request.id,
          created_by: req.user.id,
        });
      }
    } else {
      await db('training_records').where({ enrollment_request_id: request.id }).delete();
    }

    res.json({ request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// DELETE /api/requests/:id - officer withdraws their own pending request
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // enrollment_requests has no DELETE trigger (only the AFTER UPDATE
    // one), so .returning() is fine on a DELETE — the OUTPUT
    // restriction only applies when the trigger's DML type matches the
    // statement's.
    const [deleted] = await db('enrollment_requests')
      .where({ id: req.params.id, officer_id: req.user.id })
      .whereIn('status', ['pending', 'approved', 'enrolled'])
      .andWhere((builder) => builder.whereNull('attended').orWhere('attended', false))
      .delete()
      .returning('*');

    if (!deleted) {
      return res.status(400).json({ error: 'Cannot withdraw — you may have already attended this training or it has already been processed.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to withdraw request' });
  }
});

// DELETE /api/requests/:id/unenroll - supervisor removes an officer from a training
router.delete('/:id/unenroll', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const [deleted] = await db('enrollment_requests')
      .where({ id: req.params.id })
      .delete()
      .returning('*');

    if (!deleted) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unenroll' });
  }
});

module.exports = router;
