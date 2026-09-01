const express = require('express');
const router = express.Router();
const { db } = require('../db/connection');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

function fmtDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

// Submit a new external training request
router.post('/submit', requireAuth, async (req, res) => {
  const {
    training_name, description, organization, location, is_out_of_state,
    start_date, end_date, duration_hours,
    training_cost, travel_cost, hotel_cost, per_diem,
    website, reason, first_approver_id
  } = req.body;

  if (!training_name || !first_approver_id) {
    return res.status(400).json({ error: 'Training name and first approver are required' });
  }

  try {
    const approver = await db('users').where({ id: first_approver_id }).first();
    if (!approver) {
      return res.status(404).json({ error: 'Approver not found' });
    }

    const [request] = await db('external_training_requests')
      .insert({
        officer_id: req.user.id,
        training_name,
        description: description || null,
        organization,
        location,
        is_out_of_state: is_out_of_state || false,
        start_date: start_date || null,
        end_date: end_date || null,
        duration_hours: duration_hours || null,
        training_cost: training_cost || null,
        travel_cost: travel_cost || null,
        hotel_cost: hotel_cost || null,
        per_diem: per_diem || null,
        website: website || null,
        reason: reason || null,
        chain_status: 'in_progress',
      })
      .returning('*');

    await db('approval_steps').insert({
      external_request_id: request.id,
      step_number: 1,
      approver_id: first_approver_id,
      approver_name: approver.full_name,
      approver_rank: approver.rank,
    });

    sendMail({
      to: approver.email,
      subject: `External training request awaiting your approval - ${training_name}`,
      text: `${req.user.full_name} has requested to attend "${training_name}"` +
        (fmtDate(start_date) ? ` on ${fmtDate(start_date)}` : '') +
        `.\n\nLog in to the Training Portal to review and approve or deny this request.`,
    });

    res.status(201).json({ request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// Get my external training requests
router.get('/my-requests', requireAuth, async (req, res) => {
  try {
    const requests = await db('external_training_requests as etr')
      .select(
        'etr.*',
        db.raw("CONVERT(varchar(10), etr.start_date, 23) as start_date"),
        db.raw("CONVERT(varchar(10), etr.end_date, 23) as end_date"),
        db.raw("(SELECT TOP 1 comment FROM approval_steps WHERE external_request_id = etr.id AND decision = 'returned' ORDER BY decided_at DESC) as return_comment"),
        db.raw("(SELECT TOP 1 approver_name FROM approval_steps WHERE external_request_id = etr.id AND decision = 'returned' ORDER BY decided_at DESC) as returned_by")
      )
      .where('etr.officer_id', req.user.id)
      .orderBy('etr.created_at', 'desc');

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Get approval chain for an external request
router.get('/chain/:requestId', requireAuth, async (req, res) => {
  try {
    // Explicit column list rather than '*', for the same reason noted
    // in transcripts.js: selecting '*' alongside a same-named
    // CONVERT(...) as start_date column creates two ambiguously-named
    // columns in the result set (native + converted), which the driver
    // resolving down to a single JS property is not something to rely
    // on. Listing columns explicitly avoids the ambiguity outright.
    const request = await db('external_training_requests')
      .select(
        'id', 'officer_id', 'training_name', 'organization', 'location',
        'is_out_of_state', 'duration_hours', 'description',
        'training_cost', 'travel_cost', 'hotel_cost', 'per_diem',
        'website', 'reason', 'officer_response', 'status', 'chain_status',
        'attended', 'created_at', 'updated_at',
        db.raw("CONVERT(varchar(10), start_date, 23) as start_date"),
        db.raw("CONVERT(varchar(10), end_date, 23) as end_date")
      )
      .where({ id: req.params.requestId, officer_id: req.user.id })
      .first();

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const steps = await db('approval_steps as ap')
      .select('ap.*', db.raw("FORMAT(ap.decided_at AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time', 'MM/dd/yyyy hh:mm tt') as decided_at_central"))
      .where('ap.external_request_id', req.params.requestId)
      .orderBy('ap.step_number', 'asc');

    res.json({ request, steps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch chain' });
  }
});

// Get pending external requests for current approver
router.get('/my-pending', requireAuth, async (req, res) => {
  try {
    const approvals = await db('approval_steps as ap')
      .join('external_training_requests as etr', 'ap.external_request_id', 'etr.id')
      .join('users as u', 'etr.officer_id', 'u.id')
      .select(
        'ap.*',
        'etr.training_name', 'etr.organization', 'etr.location',
        'etr.is_out_of_state', 'etr.reason',
        'etr.training_cost', 'etr.travel_cost', 'etr.hotel_cost', 'etr.per_diem',
        'etr.website', 'etr.chain_status', 'etr.officer_id',
        db.raw("CONVERT(varchar(10), etr.start_date, 23) as start_date"),
        db.raw("CONVERT(varchar(10), etr.end_date, 23) as end_date"),
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

// Act on an external training approval step
router.post('/act/:stepId', requireAuth, async (req, res) => {
  const { decision, comment, next_approver_id } = req.body;

  if (!decision || !['approved', 'denied', 'returned'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved, denied, or returned' });
  }

  try {
    const step = await db('approval_steps')
      .where({ id: req.params.stepId, approver_id: req.user.id })
      .first();

    if (!step) {
      return res.status(404).json({ error: 'Approval step not found' });
    }

    const externalRequest = await db('external_training_requests as etr')
      .join('users as o', 'etr.officer_id', 'o.id')
      .select('etr.*', 'o.full_name as officer_name', 'o.email as officer_email')
      .where('etr.id', step.external_request_id)
      .first();

    const currentRank = req.user.rank?.toLowerCase();
    const isOutOfState = externalRequest.is_out_of_state;

    // Finalizes at Captain (in-state) or Assistant Chief (out-of-state).
    // The coordinator is notified by email at that point - it is not a
    // required approval step, per the actual approval policy.
    const isFinalStep = (currentRank === 'captain' && !isOutOfState) || currentRank === 'assistant chief';

    await db('approval_steps')
      .where({ id: req.params.stepId })
      .update({ decision, comment: comment || null, next_approver_id: next_approver_id || null, decided_at: db.fn.now() });

    // Handle returned decision
    if (decision === 'returned') {
      await db('external_training_requests').where({ id: step.external_request_id }).update({ chain_status: 'returned' });

      sendMail({
        to: externalRequest.officer_email,
        subject: `Action needed on your training request - ${externalRequest.training_name}`,
        text: `${req.user.full_name} has returned your request for "${externalRequest.training_name}" for more information.\n\n` +
          (comment ? `Their comment: ${comment}\n\n` : '') +
          `Log in to the Training Portal to review and resubmit your request.`,
      });

      return res.json({ ok: true, is_final: false, returned: true });
    }

    if (isFinalStep) {
      await db('external_training_requests')
        .where({ id: step.external_request_id })
        .update({ status: decision, chain_status: 'complete' });

      sendMail({
        to: externalRequest.officer_email,
        subject: `Your training request has been ${decision} - ${externalRequest.training_name}`,
        text: decision === 'approved'
          ? `Good news - your request to attend "${externalRequest.training_name}"` +
            (fmtDate(externalRequest.start_date) ? ` on ${fmtDate(externalRequest.start_date)}` : '') +
            ` has been approved.` +
            (comment ? `\n\nComment: ${comment}` : '')
          : `Your request to attend "${externalRequest.training_name}" was not approved.` +
            (comment ? `\n\nReason: ${comment}` : '') +
            `\n\nLog in to the Training Portal for details.`,
      });

      const coordinator = await db('users')
        .select('full_name', 'email')
        .where({ role: 'coordinator', is_active: true })
        .first();
      if (coordinator) {
        sendMail({
          to: coordinator.email,
          subject: `External training request ${decision} - ${externalRequest.training_name}`,
          text: `FYI - ${externalRequest.officer_name}'s request for "${externalRequest.training_name}" was ${decision} by ${req.user.full_name} (${req.user.rank}).\n\n` +
            `No action is needed from you; this is for your records.`,
        });
      }
    } else if (next_approver_id) {
      const nextApprover = await db('users').where({ id: next_approver_id }).first();
      const { max } = await db('approval_steps').where({ external_request_id: step.external_request_id }).max('step_number as max').first();

      await db('approval_steps').insert({
        external_request_id: step.external_request_id,
        step_number: max + 1,
        approver_id: next_approver_id,
        approver_name: nextApprover.full_name,
        approver_rank: nextApprover.rank,
      });

      await db('external_training_requests').where({ id: step.external_request_id }).update({ chain_status: 'in_progress' });

      sendMail({
        to: nextApprover.email,
        subject: `Training request awaiting your approval - ${externalRequest.training_name}`,
        text: `${externalRequest.officer_name}'s request to attend "${externalRequest.training_name}" needs your review.\n\n` +
          `Log in to the Training Portal to review and approve or deny this request.`,
      });
    }

    // Insert additional approver if requested
    if (req.body.additional_approver_id) {
      const addlApprover = await db('users').where({ id: req.body.additional_approver_id }).first();
      const { max } = await db('approval_steps').where({ external_request_id: step.external_request_id }).max('step_number as max').first();

      await db('approval_steps').insert({
        external_request_id: step.external_request_id,
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

router.get('/history/:requestId', requireAuth, async (req, res) => {
  try {
    const steps = await db('approval_steps as ap')
      .select('ap.*', db.raw("FORMAT(ap.decided_at AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time', 'MM/dd/yyyy hh:mm tt') as decided_at_central"))
      .where('ap.external_request_id', req.params.requestId)
      .whereNotNull('ap.decision')
      .orderBy('ap.step_number', 'asc');

    res.json({ steps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /api/external/respond/:requestId - officer responds to a returned external request
router.post('/respond/:requestId', requireAuth, async (req, res) => {
  const { officer_response, reason, training_cost, travel_cost, hotel_cost, per_diem,
    training_name, organization, location, is_out_of_state, start_date, end_date,
    duration_hours, website, description } = req.body;

  try {
    const request = await db('external_training_requests')
      .where({ id: req.params.requestId, officer_id: req.user.id })
      .first();

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.chain_status !== 'returned') {
      return res.status(400).json({ error: 'This request has not been returned for more information' });
    }

    // The original Postgres version used COALESCE($n, column) at the SQL
    // layer for most fields — "keep the existing value if nothing new
    // was submitted." Same effect achieved here in JS with `|| request.x`
    // before the update, using the row already fetched above; this
    // keeps the query itself simpler and dialect-neutral. Note
    // is_out_of_state is NOT coalesced, matching the original exactly —
    // it always gets overwritten with the submitted value (defaulting
    // to false), unlike the other fields.
    await db('external_training_requests')
      .where({ id: req.params.requestId })
      .update({
        officer_response: officer_response || null,
        reason: reason || request.reason,
        training_cost: training_cost || null,
        travel_cost: travel_cost || null,
        hotel_cost: hotel_cost || null,
        per_diem: per_diem || null,
        training_name: training_name || request.training_name,
        organization: organization || request.organization,
        location: location || request.location,
        is_out_of_state: is_out_of_state || false,
        start_date: start_date || request.start_date,
        end_date: end_date || request.end_date,
        duration_hours: duration_hours || request.duration_hours,
        website: website || request.website,
        description: description || request.description,
        chain_status: 'in_progress',
      });

    // Create a new pending step for the approver who returned it
    const returnedStep = await db('approval_steps')
      .where({ external_request_id: req.params.requestId, decision: 'returned' })
      .orderBy('decided_at', 'desc')
      .first();

    if (returnedStep) {
      const { max } = await db('approval_steps').where({ external_request_id: req.params.requestId }).max('step_number as max').first();

      await db('approval_steps').insert({
        external_request_id: req.params.requestId,
        step_number: max + 1,
        approver_id: returnedStep.approver_id,
        approver_name: returnedStep.approver_name,
        approver_rank: returnedStep.approver_rank,
      });

      const approverInfo = await db('users').select('email').where({ id: returnedStep.approver_id }).first();

      sendMail({
        to: approverInfo?.email,
        subject: `Updated training request ready for your review - ${request.training_name}`,
        text: `${req.user.full_name} has responded to your request for more information on "${request.training_name}".\n\n` +
          `Log in to the Training Portal to review the updated request.`,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // external_training_requests has no update trigger, so .returning()
    // is fine on this DELETE.
    const [deleted] = await db('external_training_requests')
      .where({ id: req.params.id, officer_id: req.user.id })
      .whereNot('chain_status', 'complete')
      .delete()
      .returning('*');

    if (!deleted) {
      return res.status(400).json({ error: 'Cannot withdraw this request' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to withdraw request' });
  }
});

// GET /api/external/all - all external requests (supervisor/coordinator)
router.get('/all', requireAuth, requireRole('supervisor', 'coordinator'), async (req, res) => {
  try {
    const baseColumns = [
      'etr.*',
      db.raw("CONVERT(varchar(10), etr.start_date, 23) as start_date"),
      db.raw("CONVERT(varchar(10), etr.end_date, 23) as end_date"),
      'u.full_name as officer_name', 'u.badge_number', 'u.unit',
    ];

    let requests;
    if (req.user.role === 'coordinator') {
      requests = await db('external_training_requests as etr')
        .join('users as u', 'etr.officer_id', 'u.id')
        .select(...baseColumns)
        .orderBy('etr.created_at', 'desc');
    } else {
      requests = await db('external_training_requests as etr')
        .distinct()
        .join('users as u', 'etr.officer_id', 'u.id')
        .leftJoin('approval_steps as ap', 'ap.external_request_id', 'etr.id')
        .select(...baseColumns)
        .where('ap.approver_id', req.user.id)
        .orderBy('etr.created_at', 'desc');
    }

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch external requests' });
  }
});

module.exports = router;
