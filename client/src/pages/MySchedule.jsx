import { useState, useEffect } from 'react'
import axios from 'axios'

const pulseStyle = `
  @keyframes pulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
    100% { opacity: 1; transform: scale(1); }
  }
`

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  warning: '#B5621B', warningLight: '#FFF0E0',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

function StatusBadge({ status, chainStatus }) {
  if (chainStatus === 'returned') {
    return <span style={{ background: '#FFF0E0', color: '#B5621B', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>More Info Needed</span>
  }
  if (chainStatus === 'in_progress') {
    return <span style={{ background: '#FFF8E1', color: '#8A6000', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>In Review</span>
  }
  const styles = {
    pending: { bg: '#FFF8E1', text: '#8A6000', label: 'Pending' },
    approved: { bg: COLORS.successLight, text: COLORS.success, label: 'Approved' },
    denied: { bg: COLORS.dangerLight, text: COLORS.danger, label: 'Denied' },
    enrolled: { bg: '#E0ECF8', text: '#1A5A8A', label: 'Enrolled' },
  }
  const s = styles[status] || styles.pending
  return <span style={{ background: s.bg, color: s.text, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>{s.label}</span>
}

function ChainTimeline({ steps }) {
  if (!steps || steps.length === 0) return null
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Approval Chain</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => (
          <div key={step.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                background: step.decision === 'approved' ? COLORS.successLight : step.decision === 'denied' ? COLORS.dangerLight : COLORS.bg,
                color: step.decision === 'approved' ? COLORS.success : step.decision === 'denied' ? COLORS.danger : COLORS.textLight,
                border: `2px solid ${step.decision === 'approved' ? COLORS.success : step.decision === 'denied' ? COLORS.danger : COLORS.border}`,
              }}>
                {step.decision === 'approved' ? '✓' : step.decision === 'denied' ? '✗' : i + 1}
              </div>
              {i < steps.length - 1 && <div style={{ width: 2, height: 20, background: COLORS.border, margin: '2px 0' }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{step.approver_name}</div>
                  <div style={{ fontSize: 11, color: COLORS.textLight }}>{step.approver_rank}</div>
                </div>
                {step.decided_at_central && (
                  <div style={{ fontSize: 11, color: COLORS.textLight }}>{step.decided_at_central}</div>
                )}
              </div>
              {step.decision && (
                <div style={{ marginTop: 4 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                    background: step.decision === 'approved' ? COLORS.successLight : COLORS.dangerLight,
                    color: step.decision === 'approved' ? COLORS.success : COLORS.danger,
                  }}>{step.decision}</span>
                  {step.comment && <div style={{ fontSize: 12, color: COLORS.textMid, marginTop: 4, fontStyle: 'italic' }}>"{step.comment}"</div>}
                </div>
              )}
              {!step.decision && (
                <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>Awaiting review...</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReturnedResponseForm({ request, onSubmit }) {
  const [form, setForm] = useState({
    reason: request.reason || '',
    officer_response: '',
    training_cost: request.training_cost || '',
    travel_cost: request.travel_cost || '',
    hotel_cost: request.hotel_cost || '',
    per_diem: request.per_diem || '',
  })
  const [submitting, setSubmitting] = useState(false)

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }))

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1px solid #D1D9E6', fontSize: 13,
    color: '#0D1B2A', background: '#FFFFFF', boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: '#6B7F96', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em'
  }

  const totalCost = (
    parseFloat(form.training_cost || 0) +
    parseFloat(form.travel_cost || 0) +
    parseFloat(form.hotel_cost || 0) +
    parseFloat(form.per_diem || 0)
  ).toFixed(2)

  return (
    <div style={{ padding: '16px 22px', borderTop: '1px solid #D1D9E6', background: '#FFF8F0' }}>
      {request.return_comment && (
        <div style={{ background: '#FFFFFF', border: '1px solid #C9A84C', borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B5621B', marginBottom: 4, textTransform: 'uppercase' }}>{request.returned_by || 'Approver'} is requesting more information:</div>
          <div style={{ fontSize: 13, color: '#3D5166' }}>{request.return_comment}</div>
        </div>
      )}
      {!request.return_comment && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#B5621B', marginBottom: 16 }}>⚠️ Your request has been returned — please review and resubmit.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Your Response to Approver</label>
          <textarea
            value={form.officer_response}
            onChange={e => set('officer_response', e.target.value)}
            placeholder="Address the approver's concerns..."
            style={{ ...inputStyle, height: 70, resize: 'vertical' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Reason for Attending</label>
          <textarea
            value={form.reason}
            onChange={e => set('reason', e.target.value)}
            style={{ ...inputStyle, height: 70, resize: 'vertical' }}
          />
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7F96', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estimated Costs</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {[
          { label: 'Training Cost ($)', key: 'training_cost' },
          { label: 'Travel Cost ($)', key: 'travel_cost' },
          { label: 'Hotel Cost ($)', key: 'hotel_cost' },
          { label: 'Per Diem ($)', key: 'per_diem' },
        ].map(({ label, key }) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <input
              type="number" step="0.01" min="0"
              style={inputStyle}
              value={form[key]}
              onChange={e => set(key, e.target.value)}
              placeholder="0.00"
            />
          </div>
        ))}
      </div>
      {parseFloat(totalCost) > 0 && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', marginBottom: 12 }}>
          Total Estimated: ${totalCost}
        </div>
      )}

      <button
        onClick={async () => { setSubmitting(true); await onSubmit(request, form); setSubmitting(false) }}
        disabled={submitting}
        style={{ padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', border: 'none', background: '#0D1B2A', color: '#FFFFFF' }}
      >
        {submitting ? 'Submitting...' : 'Resubmit Request'}
      </button>
    </div>
  )
}

export default function MySchedule() {
  const [requests, setRequests] = useState([])
  const [chains, setChains] = useState({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [loadingChain, setLoadingChain] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    Promise.all([
      axios.get('/api/requests'),
      axios.get('/api/external/my-requests'),
    ]).then(([rr, er]) => {
      const portalRequests = rr.data.requests.map(r => ({ ...r, source: 'portal' }))
      const externalRequests = er.data.requests.map(r => ({
        ...r,
        source: 'external',
        title: r.training_name,
        session_date: r.start_date,
        location: r.location,
        request_type: 'self_requested',
      }))
      setRequests([...portalRequests, ...externalRequests].sort((a, b) => new Date(a.session_date) - new Date(b.session_date)))
    }).finally(() => setLoading(false))
  }, [])

  const handleExpand = async (request) => {
  const requestId = request.id
  if (expanded === requestId) {
    setExpanded(null)
    return
  }
  setExpanded(requestId)
  if (!chains[requestId]) {
    setLoadingChain(requestId)
    try {
      const endpoint = request.source === 'external'
        ? `/api/external/chain/${requestId}`
        : `/api/approvals/chain/${requestId}`
      const res = await axios.get(endpoint)
      setChains(prev => ({ ...prev, [requestId]: res.data.steps }))
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingChain(null)
    }
  }
}

  const handleWithdraw = async (requestId) => {
    if (!confirm('Withdraw this request?')) return
    try {
      await axios.delete(`/api/requests/${requestId}`)
      setRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (err) {
      alert(err.response?.data?.error || 'Could not withdraw request')
    }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleRespond = async (request, responseData) => {
  try {
    const endpoint = request.source === 'external'
      ? `/api/external/respond/${request.id}`
      : `/api/approvals/respond/${request.id}`
    await axios.post(endpoint, responseData)
    const [rr, er] = await Promise.all([
      axios.get('/api/requests'),
      axios.get('/api/external/my-requests'),
    ])
    const portalRequests = rr.data.requests.map(r => ({ ...r, source: 'portal' }))
    const externalRequests = er.data.requests.map(r => ({
      ...r, source: 'external', title: r.training_name,
      session_date: r.start_date, location: r.location, request_type: 'self_requested',
    }))
    setRequests([...portalRequests, ...externalRequests].sort((a, b) => new Date(a.session_date) - new Date(b.session_date)))
    showToast('Response submitted successfully.')
  } catch (err) {
    showToast(err.response?.data?.error || 'Failed to submit response', 'error')
  }
}

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
      <style>{pulseStyle}</style>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>My Training Schedule</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>Your upcoming trainings and request statuses.</p>
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textLight, background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>No trainings scheduled yet</div>
          <div style={{ fontSize: 13 }}>Browse available trainings and submit a request to attend.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map(r => (
            <div key={r.id} style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎓</div>
                  <div>
                    <div style={{ fontWeight: 700, color: COLORS.textDark, fontSize: 15 }}>{r.title}</div>
                    <div style={{ color: COLORS.textLight, fontSize: 12, marginTop: 2 }}>
                      {r.session_date ? new Date(r.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                      {r.start_time ? ` · ${(() => { const [h, m] = r.start_time.split(':'); const hour = parseInt(h); return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}` })()}` : ''}
                      {r.location ? ` · ${r.location}` : ''}
                      {' · '}{r.source === 'external' ? 'External training request' : r.request_type === 'supervisor_enrolled' ? 'Enrolled by supervisor' : 'Self-requested'}
                    </div>
                    {r.denial_note && (
                      <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 4 }}>Note: {r.denial_note}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusBadge status={r.status} chainStatus={r.chain_status} />
                    {r.chain_status === 'returned' && (
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#B5621B', animation: 'pulse 1.5s infinite' }} />
                    )}
                  </div>
                  {r.request_type === 'self_requested' && (
                    <button
                      onClick={() => handleExpand(r)}
                      style={{ fontSize: 12, fontWeight: 600, color: COLORS.navy, background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
                    >
                      {expanded === r.id ? 'Hide Chain' : 'View Chain'}
                    </button>
                  )}
                  {(r.status === 'pending' || r.status === 'approved' || r.status === 'enrolled') && r.request_type === 'self_requested' && (
                    <button onClick={() => handleWithdraw(r.id)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textLight }}>Withdraw</button>
                  )}
                </div>
              </div>
              
    {r.chain_status === 'returned' && (
      <ReturnedResponseForm request={r} onSubmit={handleRespond} />
    )}
    {expanded === r.id && (
      <div style={{ padding: '0 22px 18px' }}>
        {loadingChain === r.id ? (
          <div style={{ fontSize: 13, color: COLORS.textLight }}>Loading chain...</div>
        ) : (
          <ChainTimeline steps={chains[r.id]} />
        )}
      </div>
    )}
            </div>
          ))}
        </div>
      )}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, background: toast.type === 'error' ? '#FDECEA' : '#0D1B2A', color: toast.type === 'error' ? '#9B2335' : '#FFFFFF', padding: '14px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxWidth: 380, zIndex: 200, borderLeft: `4px solid ${toast.type === 'error' ? '#9B2335' : '#C9A84C'}` }}>
          {toast.msg}
  </div>
)}
    </div>
  )
}
