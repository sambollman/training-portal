const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

// Get list of valid first approvers for an officer
// If officer is sergeant/manager, returns lieutenants
// Otherwise returns sergeants and managers
router.get('/first-approvers', requireAuth, async (req, res) => {
  try {
    const officerRank = req.user.rank?.toLowerCase()
    const isSgtOrManager = officerRank === 'sergeant' || officerRank === 'manager'

    let ranks
    if (isSgtOrManager) {
      ranks = ['Lieutenant']
    } else {
      ranks = ['Sergeant', 'Manager']
    }

    const placeholders = ranks.map((_, i) => `$${i + 1}`).join(', ')
    const result = await db.query(`
      SELECT id, first_name, last_name, full_name, rank, unit, badge_number
      FROM users
      WHERE rank IN (${placeholders}) AND is_active = true AND id != $${ranks.length + 1}
      ORDER BY last_name ASC, first_name ASC
    `, [...ranks, req.user.id])

    res.json({ approvers: result.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch approvers' })
  }
})

// Get list of next approvers based on current step
router.get('/next-approvers/:rank', requireAuth, async (req, res) => {
  try {
    const currentRank = req.params.rank.toLowerCase()
    let nextRanks

    if (currentRank === 'sergeant' || currentRank === 'manager') {
      nextRanks = ['Lieutenant']
    } else if (currentRank === 'lieutenant') {
      nextRanks = ['Captain']
    } else if (currentRank === 'captain') {
      nextRanks = ['Assistant Chief']
    } else {
      return res.json({ approvers: [] })
    }

    const placeholders = nextRanks.map((_, i) => `$${i + 1}`).join(', ')
    const result = await db.query(`
      SELECT id, first_name, last_name, full_name, rank, unit, badge_number
      FROM users
      WHERE rank IN (${placeholders}) AND is_active = true
      ORDER BY last_name ASC, first_name ASC
    `, nextRanks)

    res.json({ approvers: result.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch next approvers' })
  }
})

// Submit a self-request with reason and first approver
router.post('/submit', requireAuth, async (req, res) => {
  const { training_id, reason, first_approver_id, training_cost, travel_cost, hotel_cost, per_diem } = req.body

  if (!training_id || !first_approver_id) {
    return res.status(400).json({ error: 'Training and first approver are required' })
  }

  try {
    // Check training exists and has seats
    const training = await db.query(`
      SELECT t.*, COUNT(er.id) FILTER (WHERE er.status IN ('approved', 'enrolled')) AS enrolled_count
      FROM trainings t
      LEFT JOIN enrollment_requests er ON t.id = er.training_id
      WHERE t.id = $1 AND t.is_archived = false
      GROUP BY t.id
    `, [training_id])

    if (!training.rows[0]) {
      return res.status(404).json({ error: 'Training not found' })
    }

    const t = training.rows[0]
    if (!t.no_seat_limit && t.seat_capacity && parseInt(t.enrolled_count) >= t.seat_capacity) {
      return res.status(400).json({ error: 'Training is full' })
    }

    // Get first approver info
    const approver = await db.query('SELECT * FROM users WHERE id = $1', [first_approver_id])
    if (!approver.rows[0]) {
      return res.status(404).json({ error: 'Approver not found' })
    }

    // Create enrollment request
    const request = await db.query(`
      INSERT INTO enrollment_requests 
        (training_id, officer_id, supervisor_id, request_type, status, reason, chain_status,
        training_cost, travel_cost, hotel_cost, per_diem)
      VALUES ($1, $2, $3, 'self_requested', 'pending', $4, 'in_progress', $5, $6, $7, $8)
      RETURNING *
    `, [training_id, req.user.id, first_approver_id, reason || null,
      training_cost || null, travel_cost || null, hotel_cost || null, per_diem || null])

    const enrollmentRequest = request.rows[0]

    // Create first approval step
    await db.query(`
      INSERT INTO approval_steps (enrollment_request_id, step_number, approver_id, approver_name, approver_rank)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      enrollmentRequest.id,
      1,
      first_approver_id,
      approver.rows[0].full_name,
      approver.rows[0].rank
    ])

    res.status(201).json({ request: enrollmentRequest })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'You are already enrolled in this training' })
    }
    console.error(err)
    res.status(500).json({ error: 'Failed to submit request' })
  }
})

// Get pending approvals for the current user
router.get('/my-pending', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ap.*,
        er.reason,
        er.officer_response,
        er.training_id,
        er.officer_id,
        er.chain_status,
        er.training_cost,
        er.travel_cost,
        er.hotel_cost,
        er.per_diem,
        to_char(t.session_date, 'YYYY-MM-DD') as session_date,
        to_char(t.end_date, 'YYYY-MM-DD') as end_date,
        t.title as training_title,
        t.location,
        t.is_out_of_state,
        t.training_type,
        u.full_name as officer_name,
        u.rank as officer_rank,
        u.badge_number as officer_badge,
        u.unit as officer_unit,
        ap.is_additional
      FROM approval_steps ap
      JOIN enrollment_requests er ON ap.enrollment_request_id = er.id
      JOIN trainings t ON er.training_id = t.id
      JOIN users u ON er.officer_id = u.id
      WHERE ap.approver_id = $1
      AND ap.decision IS NULL
      ORDER BY ap.created_at ASC
    `, [req.user.id])

    res.json({ approvals: result.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch pending approvals' })
  }
})

// Get full approval chain for a request (for officer to view)
router.get('/chain/:requestId', requireAuth, async (req, res) => {
  try {
    const request = await db.query(`
      SELECT er.*, 
        to_char(t.session_date, 'YYYY-MM-DD') as session_date,
        to_char(t.end_date, 'YYYY-MM-DD') as end_date,
        t.title as training_title, t.location, t.is_out_of_state,
        u.full_name as officer_name
      FROM enrollment_requests er
      JOIN trainings t ON er.training_id = t.id
      JOIN users u ON er.officer_id = u.id
      WHERE er.id = $1 AND er.officer_id = $2
    `, [req.params.requestId, req.user.id])

    if (!request.rows[0]) {
      return res.status(404).json({ error: 'Request not found' })
    }

    const steps = await db.query(`
      SELECT ap.*, 
        to_char(ap.decided_at AT TIME ZONE 'America/Chicago', 'MM/DD/YYYY HH12:MI AM') as decided_at_central
      FROM approval_steps ap
      WHERE ap.enrollment_request_id = $1
      ORDER BY ap.step_number ASC
    `, [req.params.requestId])

    res.json({ request: request.rows[0], steps: steps.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch approval chain' })
  }
})

// Act on an approval step (approve or deny, pick next approver)
router.post('/act/:stepId', requireAuth, async (req, res) => {
  const { decision, comment, next_approver_id } = req.body

  if (!decision || !['approved', 'denied', 'returned'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approved, denied, or returned' });
  }

  try {
    // Get the step
    const stepResult = await db.query(
      'SELECT * FROM approval_steps WHERE id = $1 AND approver_id = $2',
      [req.params.stepId, req.user.id]
    )

    if (!stepResult.rows[0]) {
      return res.status(404).json({ error: 'Approval step not found' })
    }

    const step = stepResult.rows[0]

    // Get the enrollment request and training
    const requestResult = await db.query(`
      SELECT er.*, t.is_out_of_state, t.training_type
      FROM enrollment_requests er
      JOIN trainings t ON er.training_id = t.id
      WHERE er.id = $1
    `, [step.enrollment_request_id])

    const enrollmentRequest = requestResult.rows[0]
    const training = enrollmentRequest

    // Determine if this is the final step
    const currentRank = req.user.rank?.toLowerCase()
    const isOutOfState = training.is_out_of_state
    const isFinalStep = 
      currentRank === 'captain' && !isOutOfState ||
      currentRank === 'assistant chief'

    // Update the current step
    await db.query(`
      UPDATE approval_steps SET
        decision = $1, comment = $2, next_approver_id = $3, decided_at = NOW()
      WHERE id = $4
    `, [decision, comment || null, next_approver_id || null, req.params.stepId])

    if (decision === 'returned') {
      await db.query(`
        UPDATE enrollment_requests SET chain_status = 'returned'
        WHERE id = $1
      `, [step.enrollment_request_id]);

      await db.query(`
        UPDATE approval_steps SET decision = 'returned', comment = $1, decided_at = NOW()
        WHERE id = $2
      `, [comment || null, req.params.stepId]);

      return res.json({ ok: true, is_final: false, returned: true });
    }

    if (isFinalStep) {
      // Complete the chain
      await db.query(`
        UPDATE enrollment_requests SET
          status = $1, chain_status = 'complete', acted_on_at = NOW(), acted_on_by = $2
        WHERE id = $3
      `, [decision, req.user.id, step.enrollment_request_id])
    } else if (next_approver_id) {
      // Get next approver info
      const nextApprover = await db.query('SELECT * FROM users WHERE id = $1', [next_approver_id])

      // Get current step number
      const maxStep = await db.query(
        'SELECT MAX(step_number) as max FROM approval_steps WHERE enrollment_request_id = $1',
        [step.enrollment_request_id]
      )

      // Create next approval step
      await db.query(`
        INSERT INTO approval_steps 
          (enrollment_request_id, step_number, approver_id, approver_name, approver_rank)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        step.enrollment_request_id,
        maxStep.rows[0].max + 1,
        next_approver_id,
        nextApprover.rows[0].full_name,
        nextApprover.rows[0].rank
      ])

      // Update chain status
      await db.query(`
        UPDATE enrollment_requests SET chain_status = 'in_progress', supervisor_id = $1
        WHERE id = $2
      `, [next_approver_id, step.enrollment_request_id])
    }
    // Insert additional approver if requested
    if (req.body.additional_approver_id) {
      const addlApprover = await db.query('SELECT * FROM users WHERE id = $1', [req.body.additional_approver_id])
      const maxStep = await db.query(
        'SELECT MAX(step_number) as max FROM approval_steps WHERE enrollment_request_id = $1',
        [step.enrollment_request_id]
      )
      await db.query(`
        INSERT INTO approval_steps (enrollment_request_id, step_number, approver_id, approver_name, approver_rank, is_additional)
        VALUES ($1, $2, $3, $4, $5, true)
      `, [
        step.enrollment_request_id,
        maxStep.rows[0].max + 1,
        req.body.additional_approver_id,
        addlApprover.rows[0].full_name,
        addlApprover.rows[0].rank
      ]);
    }
    res.json({ ok: true, is_final: isFinalStep })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to process approval' })
  }
})

// Get all requests acted on by this approver (history)
router.get('/my-history', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ap.*,
        er.reason,
        er.chain_status,
        to_char(t.session_date, 'YYYY-MM-DD') as session_date,
        t.title as training_title,
        u.full_name as officer_name,
        u.badge_number as officer_badge,
        to_char(ap.decided_at AT TIME ZONE 'America/Chicago', 'MM/DD/YYYY HH12:MI AM') as decided_at_central
      FROM approval_steps ap
      JOIN enrollment_requests er ON ap.enrollment_request_id = er.id
      JOIN trainings t ON er.training_id = t.id
      JOIN users u ON er.officer_id = u.id
      WHERE ap.approver_id = $1
      AND ap.decision IS NOT NULL
      ORDER BY ap.decided_at DESC
    `, [req.user.id])

    res.json({ history: result.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch history' })
  }
})

// Get full chain history for a request (for approvers to see previous decisions)
router.get('/history/:requestId', requireAuth, async (req, res) => {
  try {
    const steps = await db.query(`
      SELECT ap.*,
        to_char(ap.decided_at AT TIME ZONE 'America/Chicago', 'MM/DD/YYYY HH12:MI AM') as decided_at_central
      FROM approval_steps ap
      WHERE ap.enrollment_request_id = $1
      AND ap.decision IS NOT NULL
      ORDER BY ap.step_number ASC
    `, [req.params.requestId])

    res.json({ steps: steps.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch history' })
  }
})

// POST /api/approvals/respond/:requestId - officer responds to a returned request
router.post('/respond/:requestId', requireAuth, async (req, res) => {
  const { officer_response, reason, training_cost, travel_cost, hotel_cost, per_diem } = req.body;

  try {
    // Verify this is the officer's request
    const request = await db.query(
      'SELECT * FROM enrollment_requests WHERE id = $1 AND officer_id = $2',
      [req.params.requestId, req.user.id]
    );

    if (!request.rows[0]) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.rows[0].chain_status !== 'returned') {
      return res.status(400).json({ error: 'This request has not been returned for more information' });
    }

    // Update the request with the officer's response
    await db.query(`
      UPDATE enrollment_requests SET
        officer_response = $1,
        reason = $2,
        training_cost = $3,
        travel_cost = $4,
        hotel_cost = $5,
        per_diem = $6,
        chain_status = 'in_progress'
      WHERE id = $7
    `, [
      officer_response || null,
      reason || request.rows[0].reason,
      training_cost || request.rows[0].training_cost,
      travel_cost || request.rows[0].travel_cost,
      hotel_cost || request.rows[0].hotel_cost,
      per_diem || request.rows[0].per_diem,
      req.params.requestId
    ]);

    // Create a new pending step for the approver who returned it
    const returnedStep = await db.query(`
      SELECT * FROM approval_steps 
      WHERE enrollment_request_id = $1 AND decision = 'returned'
      ORDER BY decided_at DESC LIMIT 1
    `, [req.params.requestId]);

    if (returnedStep.rows[0]) {
      const maxStep = await db.query(
        'SELECT MAX(step_number) as max FROM approval_steps WHERE enrollment_request_id = $1',
        [req.params.requestId]
      );
      await db.query(`
        INSERT INTO approval_steps (enrollment_request_id, step_number, approver_id, approver_name, approver_rank)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        req.params.requestId,
        maxStep.rows[0].max + 1,
        returnedStep.rows[0].approver_id,
        returnedStep.rows[0].approver_name,
        returnedStep.rows[0].approver_rank
      ]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

module.exports = router
