const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { isDuplicateKeyError } = require('../db/errors');

// DATE/DATETIME columns come back from the driver as JS Date objects
// (true for both the old Postgres driver and the current SQL Server
// one); format them plainly for email text either way.
function fmtDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

// Get list of valid first approvers for an officer
// If officer is sergeant/manager, returns lieutenants
// Otherwise returns sergeants and managers
router.get('/first-approvers', requireAuth, async (req, res) => {
  try {
    const officerRank = req.user.rank?.toLowerCase();
    const trainingType = req.query.type; // 'internal' or 'external'
    const isCivilian = officerRank === 'civilian';
    const isSgtOrManager = officerRank === 'sergeant' || officerRank === 'manager';

    let ranks;
    if (trainingType === 'internal') {
      // Internal trainings: civilians route to a Manager, everyone else to a Lieutenant
      ranks = isCivilian ? ['Manager'] : ['Lieutenant'];
    } else if (isSgtOrManager) {
      ranks = ['Lieutenant'];
    } else {
      ranks = ['Sergeant', 'Manager'];
    }

    const approvers = await db('users')
      .select('id', 'first_name', 'last_name', 'full_name', 'rank', 'unit', 'badge_number')
      .whereIn('rank', ranks)
      .where('is_active', true)
      .whereNot('id', req.user.id)
      .orderBy('last_name', 'asc')
      .orderBy('first_name', 'asc');

    res.json({ approvers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch approvers' });
  }
});

// Get list of next approvers based on current step
router.get('/next-approvers/:rank', requireAuth, async (req, res) => {
  try {
    const currentRank = req.params.rank.toLowerCase();
    let nextRanks;

    if (currentRank === 'sergeant' || currentRank === 'manager') {
      nextRanks = ['Lieutenant'];
    } else if (currentRank === 'lieutenant') {
      nextRanks = ['Captain'];
    } else if (currentRank === 'captain') {
      nextRanks = ['Assistant Chief'];
    } else {
      return res.json({ approvers: [] });
    }

    const approvers = await db('users')
      .select('id', 'first_name', 'last_name', 'full_name', 'rank', 'unit', 'badge_number')
      .whereIn('rank', nextRanks)
      .where('is_active', true)
      .orderBy('last_name', 'asc')
      .orderBy('first_name', 'asc');

    res.json({ approvers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch next approvers' });
  }
});

// Submit a self-request with reason and first approver
router.post('/submit', requireAuth, async (req, res) => {
  const { training_id, reason, first_approver_id, training_cost, travel_cost, hotel_cost, per_diem } = req.body;

  if (!training_id || !first_approver_id) {
    return res.status(400).json({ error: 'Training and first approver are required' });
  }

  try {
    // Check training exists and has seats
    const t = await db('trainings as t')
      .select(
        't.*',
        db.raw("(SELECT COUNT(*) FROM enrollment_requests er2 WHERE er2.training_id = t.id AND er2.status IN ('approved', 'enrolled')) as enrolled_count")
      )
      .where({ 't.id': training_id, 't.is_archived': false })
      .first();

    if (!t) {
      return res.status(404).json({ error: 'Training not found' });
    }

    if (!t.no_seat_limit && t.seat_capacity && t.enrolled_count >= t.seat_capacity) {
      return res.status(400).json({ error: 'Training is full' });
    }

    // Get first approver info
    const approver = await db('users').where({ id: first_approver_id }).first();
    if (!approver) {
      return res.status(404).json({ error: 'Approver not found' });
    }

    // Create enrollment request
    const [enrollmentRequest] = await db('enrollment_requests')
      .insert({
        training_id,
        officer_id: req.user.id,
        supervisor_id: first_approver_id,
        request_type: 'self_requested',
        status: 'pending',
        reason: reason || null,
        chain_status: 'in_progress',
        training_cost: training_cost || null,
        travel_cost: travel_cost || null,
        hotel_cost: hotel_cost || null,
        per_diem: per_diem || null,
      })
      .returning('*');

    // Create first approval step
    await db('approval_steps').insert({
      enrollment_request_id: enrollmentRequest.id,
      step_number: 1,
      approver_id: first_approver_id,
      approver_name: approver.full_name,
      approver_rank: approver.rank,
    });

    sendMail({
      to: approver.email,
      subject: `Training request awaiting your approval - ${t.title}`,
      text: `${req.user.full_name} has requested to attend "${t.title}"` +
        (fmtDate(t.session_date) ? ` on ${fmtDate(t.session_date)}` : '') +
        `.\n\nLog in to the Training Portal to review and approve or deny this request.`,
    });

    res.status(201).json({ request: enrollmentRequest });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(400).json({ error: 'You are already enrolled in this training' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// Get pending approvals for the current user
router.get('/my-pending', requireAuth, async (req, res) => {
  try {
    const approvals = await db('approval_steps as ap')
      .join('enrollment_requests as er', 'ap.enrollment_request_id', 'er.id')
      .join('trainings as t', 'er.training_id', 't.id')
      .join('users as u', 'er.officer_id', 'u.id')
      .select(
        'ap.*',
        'er.reason', 'er.officer_response', 'er.training_id', 'er.officer_id', 'er.chain_status',
        'er.training_cost', 'er.travel_cost', 'er.hotel_cost', 'er.per_diem',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
        db.raw("CONVERT(varchar(10), t.end_date, 23) as end_date"),
        't.title as training_title', 't.location', 't.is_out_of_state', 't.training_type',
        'u.full_name as officer_name', 'u.rank as officer_rank', 'u.badge_number as officer_badge', 'u.unit as officer_unit',
        'ap.is_additional'
      )
      .where('ap.approver_id', req.user.id)
      .whereNull('ap.decision')
      .orderBy('ap.created_at', 'asc');

    res.json({ approvals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// Get full approval chain for a request (for officer to view)
router.get('/chain/:requestId', requireAuth, async (req, res) => {
  try {
    const request = await db('enrollment_requests as er')
      .join('trainings as t', 'er.training_id', 't.id')
      .join('users as u', 'er.officer_id', 'u.id')
      .select(
        'er.*',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
        db.raw("CONVERT(varchar(10), t.end_date, 23) as end_date"),
        't.title as training_title', 't.location', 't.is_out_of_state',
        'u.full_name as officer_name'
      )
      .where({ 'er.id': req.params.requestId, 'er.officer_id': req.user.id })
      .first();

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const steps = await db('approval_steps as ap')
      .select('ap.*', db.raw("FORMAT(ap.decided_at AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time', 'MM/dd/yyyy hh:mm tt') as decided_at_central"))
      .where('ap.enrollment_request_id', req.params.requestId)
      .orderBy('ap.step_number', 'asc');

    res.json({ request, steps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch approval chain' });
  }
});

// Act on an approval step (approve or deny, pick next approver)
router.post('/act/:stepId', requireAuth, async (req, res) => {
  const { decision, comment, next_approver_id } = req.body;

  if (!decision || !['approved', 'denied', 'returned'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved, denied, or returned' });
  }

  try {
    // Get the step
    const step = await db('approval_steps')
      .where({ id: req.params.stepId, approver_id: req.user.id })
      .first();

    if (!step) {
      return res.status(404).json({ error: 'Approval step not found' });
    }

    // Get the enrollment request, training, and officer info
    const enrollmentRequest = await db('enrollment_requests as er')
      .join('trainings as t', 'er.training_id', 't.id')
      .join('users as o', 'er.officer_id', 'o.id')
      .select(
        'er.*', 't.is_out_of_state', 't.training_type', 't.title as training_title',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
        'o.full_name as officer_name', 'o.email as officer_email', 'o.rank as officer_rank'
      )
      .where('er.id', step.enrollment_request_id)
      .first();

    const training = enrollmentRequest;

    // Determine if this is the final step.
    // Internal: officers finalize at Lieutenant, civilians finalize at Manager.
    // External: finalizes at Captain (in-state) or Assistant Chief (out-of-state).
    // The coordinator is notified by email at that point - it is not a
    // required approval step, per the actual approval policy.
    const currentRank = req.user.rank?.toLowerCase();
    const isOutOfState = training.is_out_of_state;
    const isInternal = training.training_type === 'internal';
    const isCivilianRequester = training.officer_rank?.toLowerCase() === 'civilian';

    const isFinalStep = isInternal
      ? (isCivilianRequester ? currentRank === 'manager' : currentRank === 'lieutenant')
      : ((currentRank === 'captain' && !isOutOfState) || currentRank === 'assistant chief');

    // Update the current step
    await db('approval_steps')
      .where({ id: req.params.stepId })
      .update({ decision, comment: comment || null, next_approver_id: next_approver_id || null, decided_at: db.fn.now() });

    if (decision === 'returned') {
      await db('enrollment_requests').where({ id: step.enrollment_request_id }).update({ chain_status: 'returned' });

      // Note: this repeats the decision/comment/decided_at update from
      // just above (also present in the original) — harmless since it's
      // the same values, just kept as-is rather than changing behavior
      // during this conversion.
      await db('approval_steps')
        .where({ id: req.params.stepId })
        .update({ decision: 'returned', comment: comment || null, decided_at: db.fn.now() });

      sendMail({
        to: enrollmentRequest.officer_email,
        subject: `Action needed on your training request - ${enrollmentRequest.training_title}`,
        text: `${req.user.full_name} has returned your request for "${enrollmentRequest.training_title}" for more information.\n\n` +
          (comment ? `Their comment: ${comment}\n\n` : '') +
          `Log in to the Training Portal to review and resubmit your request.`,
      });

      return res.json({ ok: true, is_final: false, returned: true });
    }

    if (isFinalStep) {
      await db('enrollment_requests')
        .where({ id: step.enrollment_request_id })
        .update({ status: decision, chain_status: 'complete', acted_on_at: db.fn.now(), acted_on_by: req.user.id });

      sendMail({
        to: enrollmentRequest.officer_email,
        subject: `Your training request has been ${decision} - ${enrollmentRequest.training_title}`,
        text: decision === 'approved'
          ? `Good news - your request to attend "${enrollmentRequest.training_title}"` +
            (fmtDate(enrollmentRequest.session_date) ? ` on ${fmtDate(enrollmentRequest.session_date)}` : '') +
            ` has been approved.` +
            (comment ? `\n\nComment: ${comment}` : '')
          : `Your request to attend "${enrollmentRequest.training_title}" was not approved.` +
            (comment ? `\n\nReason: ${comment}` : '') +
            `\n\nLog in to the Training Portal for details.`,
      });

      // For the external chain, loop in the coordinator as an FYI - not a
      // required action, so no approval step is created for them.
      if (!isInternal) {
        const coordinator = await db('users')
          .select('full_name', 'email')
          .where({ role: 'coordinator', is_active: true })
          .first();
        if (coordinator) {
          sendMail({
            to: coordinator.email,
            subject: `Training request ${decision} - ${enrollmentRequest.training_title}`,
            text: `FYI - ${enrollmentRequest.officer_name}'s request for "${enrollmentRequest.training_title}" was ${decision} by ${req.user.full_name} (${req.user.rank}).\n\n` +
              `No action is needed from you; this is for your records.`,
          });
        }
      }
    } else if (next_approver_id) {
      const nextApprover = await db('users').where({ id: next_approver_id }).first();
      const { max } = await db('approval_steps').where({ enrollment_request_id: step.enrollment_request_id }).max('step_number as max').first();

      await db('approval_steps').insert({
        enrollment_request_id: step.enrollment_request_id,
        step_number: max + 1,
        approver_id: next_approver_id,
        approver_name: nextApprover.full_name,
        approver_rank: nextApprover.rank,
      });
      await db('enrollment_requests')
        .where({ id: step.enrollment_request_id })
        .update({ chain_status: 'in_progress', supervisor_id: next_approver_id });

      sendMail({
        to: nextApprover.email,
        subject: `Training request awaiting your approval - ${enrollmentRequest.training_title}`,
        text: `${enrollmentRequest.officer_name}'s request to attend "${enrollmentRequest.training_title}" needs your review.\n\n` +
          `Log in to the Training Portal to review and approve or deny this request.`,
      });
    }

    // Insert additional approver if requested
    if (req.body.additional_approver_id) {
      const addlApprover = await db('users').where({ id: req.body.additional_approver_id }).first();
      const { max } = await db('approval_steps').where({ enrollment_request_id: step.enrollment_request_id }).max('step_number as max').first();

      await db('approval_steps').insert({
        enrollment_request_id: step.enrollment_request_id,
        step_number: max + 1,
        approver_id: req.body.additional_approver_id,
        approver_name: addlApprover.full_name,
        approver_rank: addlApprover.rank,
        is_additional: true,
      });
    }
    res.json({ ok: true, is_final: isFinalStep });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process approval' });
  }
});

// Get all requests acted on by this approver (history)
router.get('/my-history', requireAuth, async (req, res) => {
  try {
    const history = await db('approval_steps as ap')
      .join('enrollment_requests as er', 'ap.enrollment_request_id', 'er.id')
      .join('trainings as t', 'er.training_id', 't.id')
      .join('users as u', 'er.officer_id', 'u.id')
      .select(
        'ap.*', 'er.reason', 'er.chain_status',
        db.raw("CONVERT(varchar(10), t.session_date, 23) as session_date"),
        't.title as training_title', 'u.full_name as officer_name', 'u.badge_number as officer_badge',
        db.raw("FORMAT(ap.decided_at AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time', 'MM/dd/yyyy hh:mm tt') as decided_at_central")
      )
      .where('ap.approver_id', req.user.id)
      .whereNotNull('ap.decision')
      .orderBy('ap.decided_at', 'desc');

    res.json({ history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get full chain history for a request (for approvers to see previous decisions)
router.get('/history/:requestId', requireAuth, async (req, res) => {
  try {
    const steps = await db('approval_steps as ap')
      .select('ap.*', db.raw("FORMAT(ap.decided_at AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time', 'MM/dd/yyyy hh:mm tt') as decided_at_central"))
      .where('ap.enrollment_request_id', req.params.requestId)
      .whereNotNull('ap.decision')
      .orderBy('ap.step_number', 'asc');

    res.json({ steps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /api/approvals/respond/:requestId - officer responds to a returned request
router.post('/respond/:requestId', requireAuth, async (req, res) => {
  const { officer_response, reason, training_cost, travel_cost, hotel_cost, per_diem } = req.body;

  try {
    // Verify this is the officer's request
    const request = await db('enrollment_requests')
      .where({ id: req.params.requestId, officer_id: req.user.id })
      .first();

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.chain_status !== 'returned') {
      return res.status(400).json({ error: 'This request has not been returned for more information' });
    }

    // Update the request with the officer's response
    await db('enrollment_requests')
      .where({ id: req.params.requestId })
      .update({
        officer_response: officer_response || null,
        reason: reason || request.reason,
        training_cost: training_cost || request.training_cost,
        travel_cost: travel_cost || request.travel_cost,
        hotel_cost: hotel_cost || request.hotel_cost,
        per_diem: per_diem || request.per_diem,
        chain_status: 'in_progress',
      });

    // Create a new pending step for the approver who returned it
    const returnedStep = await db('approval_steps')
      .where({ enrollment_request_id: req.params.requestId, decision: 'returned' })
      .orderBy('decided_at', 'desc')
      .first();

    if (returnedStep) {
      const { max } = await db('approval_steps').where({ enrollment_request_id: req.params.requestId }).max('step_number as max').first();

      await db('approval_steps').insert({
        enrollment_request_id: req.params.requestId,
        step_number: max + 1,
        approver_id: returnedStep.approver_id,
        approver_name: returnedStep.approver_name,
        approver_rank: returnedStep.approver_rank,
      });

      const approverInfo = await db('users').select('email').where({ id: returnedStep.approver_id }).first();
      const trainingInfo = await db('trainings').select('title').where({ id: request.training_id }).first();

      sendMail({
        to: approverInfo?.email,
        subject: `Updated training request ready for your review - ${trainingInfo?.title || ''}`,
        text: `${req.user.full_name} has responded to your request for more information on "${trainingInfo?.title || 'their training request'}".\n\n` +
          `Log in to the Training Portal to review the updated request.`,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

module.exports = router;
