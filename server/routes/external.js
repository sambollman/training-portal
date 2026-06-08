const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

// Submit a new external training request
router.post('/submit', requireAuth, async (req, res) => {
  const {
    training_name, organization, location, is_out_of_state,
    start_date, end_date, duration_hours,
    training_cost, travel_cost, hotel_cost, per_diem,
    website, reason, first_approver_id
  } = req.body;

  if (!training_name || !first_approver_id) {
    return res.status(400).json({ error: 'Training name and first approver are required' });
  }

  try {
    const approver = await db.query('SELECT * FROM users WHERE id = $1', [first_approver_id]);
    if (!approver.rows[0]) {
      return res.status(404).json({ error: 'Approver not found' });
    }

    const request = await db.query(`
      INSERT INTO external_training_requests (
        officer_id, training_name, organization, location, is_out_of_state,
        start_date, end_date, duration_hours,
        training_cost, travel_cost, hotel_cost, per_diem,
        website, reason, chain_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'in_progress')
      RETURNING *
    `, [
      req.user.id, training_name, organization, location, is_out_of_state || false,
      start_date || null, end_date || null, duration_hours || null,
      training_cost || null, travel_cost || null, hotel_cost || null, per_diem || null,
      website || null, reason || null
    ]);

    await db.query(`
      INSERT INTO approval_steps
        (external_request_id, step_number, approver_id, approver_name, approver_rank)
      VALUES ($1, 1, $2, $3, $4)
    `, [
      request.rows[0].id,
      first_approver_id,
      approver.rows[0].full_name,
      approver.rows[0].rank
    ]);

    res.status(201).json({ request: request.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// Get my external training requests
router.get('/my-requests', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *,
        to_char(start_date, 'YYYY-MM-DD') as start_date,
        to_char(end_date, 'YYYY-MM-DD') as end_date
      FROM external_training_requests
      WHERE officer_id = $1
      ORDER BY created_at DESC
    `, [req.user.id]);
    res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Get approval chain for an external request
router.get('/chain/:requestId', requireAuth, async (req, res) => {
  try {
    const request = await db.query(`
      SELECT *,
        to_char(start_date, 'YYYY-MM-DD') as start_date,
        to_char(end_date, 'YYYY-MM-DD') as end_date
      FROM external_training_requests
      WHERE id = $1 AND officer_id = $2
    `, [req.params.requestId, req.user.id]);

    if (!request.rows[0]) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const steps = await db.query(`
      SELECT ap.*,
        to_char(ap.decided_at AT TIME ZONE 'America/Chicago', 'MM/DD/YYYY HH12:MI AM') as decided_at_central
      FROM approval_steps ap
      WHERE ap.external_request_id = $1
      ORDER BY ap.step_number ASC
    `, [req.params.requestId]);

    res.json({ request: request.rows[0], steps: steps.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch chain' });
  }
});

// Get pending external requests for current approver
router.get('/my-pending', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        ap.*,
        etr.training_name, etr.organization, etr.location,
        etr.is_out_of_state, etr.reason,
        etr.training_cost, etr.travel_cost, etr.hotel_cost, etr.per_diem,
        etr.website, etr.chain_status, etr.officer_id,
        to_char(etr.start_date, 'YYYY-MM-DD') as start_date,
        to_char(etr.end_date, 'YYYY-MM-DD') as end_date,
        u.full_name as officer_name,
        u.rank as officer_rank,
        u.badge_number as officer_badge,
        u.unit as officer_unit
      FROM approval_steps ap
      JOIN external_training_requests etr ON ap.external_request_id = etr.id
      JOIN users u ON etr.officer_id = u.id
      WHERE ap.approver_id = $1
      AND ap.decision IS NULL
      ORDER BY ap.created_at ASC
    `, [req.user.id]);

    res.json({ approvals: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// Act on an external training approval step
router.post('/act/:stepId', requireAuth, async (req, res) => {
  const { decision, comment, next_approver_id } = req.body;

  if (!decision || !['approved', 'denied'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved or denied' });
  }

  try {
    const stepResult = await db.query(
      'SELECT * FROM approval_steps WHERE id = $1 AND approver_id = $2',
      [req.params.stepId, req.user.id]
    );

    if (!stepResult.rows[0]) {
      return res.status(404).json({ error: 'Approval step not found' });
    }

    const step = stepResult.rows[0];

    const requestResult = await db.query(
      'SELECT * FROM external_training_requests WHERE id = $1',
      [step.external_request_id]
    );

    const externalRequest = requestResult.rows[0];
    const currentRank = req.user.rank?.toLowerCase();
    const isOutOfState = externalRequest.is_out_of_state;
    const isFinalStep =
      (currentRank === 'captain' && !isOutOfState) ||
      currentRank === 'assistant chief';

    await db.query(`
      UPDATE approval_steps SET
        decision = $1, comment = $2, next_approver_id = $3, decided_at = NOW()
      WHERE id = $4
    `, [decision, comment || null, next_approver_id || null, req.params.stepId]);

    if (isFinalStep) {
      await db.query(`
        UPDATE external_training_requests SET
          status = $1, chain_status = 'complete'
        WHERE id = $2
      `, [decision, step.external_request_id]);
    } else if (next_approver_id) {
      const nextApprover = await db.query('SELECT * FROM users WHERE id = $1', [next_approver_id]);
      const maxStep = await db.query(
        'SELECT MAX(step_number) as max FROM approval_steps WHERE external_request_id = $1',
        [step.external_request_id]
      );

      await db.query(`
        INSERT INTO approval_steps
          (external_request_id, step_number, approver_id, approver_name, approver_rank)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        step.external_request_id,
        maxStep.rows[0].max + 1,
        next_approver_id,
        nextApprover.rows[0].full_name,
        nextApprover.rows[0].rank
      ]);

      await db.query(`
        UPDATE external_training_requests SET chain_status = 'in_progress'
        WHERE id = $1
      `, [step.external_request_id]);
    }

    res.json({ ok: true, is_final: isFinalStep });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process approval' });
  }
});

module.exports = router;