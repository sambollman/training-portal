import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  warning: '#B5621B', warningLight: '#FFF0E0',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

export default function Pending() {
  const { user } = useAuth()
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [decision, setDecision] = useState('')
  const [comment, setComment] = useState('')
  const [nextApprovers, setNextApprovers] = useState([])
  const [selectedNextApprover, setSelectedNextApprover] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)
  const [loadingNext, setLoadingNext] = useState(false)
  const [previousSteps, setPreviousSteps] = useState([])
  const [additionalApprover, setAdditionalApprover] = useState('')
  const [allApprovers, setAllApprovers] = useState([])

  useEffect(() => {
    Promise.all([
      axios.get('/api/approvals/my-pending'),
      axios.get('/api/external/my-pending'),
      axios.get('/api/admin/users'),
    ]).then(([pr, er, ur]) => {
      const portal = pr.data.approvals.map(a => ({ ...a, source: 'portal', display_title: a.training_title }))
      const external = er.data.approvals.map(a => ({ ...a, source: 'external', display_title: a.training_name }))
      setApprovals([...portal, ...external].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
      setAllApprovers(ur.data.users.filter(u => u.is_active && (u.role === 'supervisor' || u.role === 'coordinator')))
    }).finally(() => setLoading(false))
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSelect = async (approval) => {
    setSelected(approval)
    setDecision('')
    setComment('')
    setSelectedNextApprover('')
    setNextApprovers([])
    setPreviousSteps([])
    setAdditionalApprover('')

    try {
      const endpoint = approval.source === 'external'
        ? `/api/external/history/${approval.external_request_id}`
        : `/api/approvals/history/${approval.enrollment_request_id}`
      const res = await axios.get(endpoint)
      setPreviousSteps(res.data.steps)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDecisionChange = async (d) => {
    setDecision(d)
    setSelectedNextApprover('')

    const rank = selected?.approver_rank?.toLowerCase()
    const isOutOfState = selected?.is_out_of_state
    const isInternal = selected?.training_type === 'internal'
    const isFinal = selected && (
      isInternal
        ? rank === 'lieutenant'
        : rank === 'coordinator'
    if (isFinal) {
      setNextApprovers([])
      return
    )

    if (d !== 'returned' && !isFinal) {
      setLoadingNext(true)
      try {
        const res = await axios.get(`/api/approvals/next-approvers/${encodeURIComponent(selected.approver_rank)}`)
        setNextApprovers(res.data.approvers)
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingNext(false)
      }
    } else {
      setNextApprovers([])
    }
  }

  const handleSubmit = async () => {
    if (!decision) { showToast('Please select a decision', 'error'); return }
    if (decision !== 'returned' && nextApprovers.length > 0 && !selectedNextApprover && !selected.is_additional) {
      showToast('Please select who to forward this to', 'error'); return
    }
    setSubmitting(true)
    try {
      const endpoint = selected.source === 'external'
        ? `/api/external/act/${selected.id}`
        : `/api/approvals/act/${selected.id}`
      const res = await axios.post(endpoint, {
        decision,
        comment,
        next_approver_id: selectedNextApprover || null,
        additional_approver_id: additionalApprover || null,
      })
      setApprovals(prev => prev.filter(a => a.id !== selected.id))
      setSelected(null)
      window.dispatchEvent(new Event('approval-acted'))
      if (res.data.returned) {
        showToast('Request sent back to officer for more information.')
      } else {
        showToast(res.data.is_final ? 'Decision recorded. Officer has been notified.' : 'Decision recorded. Request forwarded to next approver.')
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit decision', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const rank = selected?.approver_rank?.toLowerCase()
  const isOutOfState = selected?.is_out_of_state
  const isFinal = selected && (
    (rank === 'captain' && !isOutOfState) ||
    rank === 'assistant chief'
  )

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>

      {/* Left - pending list */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: '0 0 6px' }}>Pending Approvals</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginBottom: 16 }}>Select a request to review and act on.</p>

        {approvals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: COLORS.textLight, background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600 }}>All caught up!</div>
            <div style={{ fontSize: 13 }}>No pending requests.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {approvals.map(a => (
              <div
                key={a.id}
                onClick={() => handleSelect(a)}
                style={{
                  background: selected?.id === a.id ? COLORS.navy : COLORS.white,
                  border: `1.5px solid ${selected?.id === a.id ? COLORS.navy : COLORS.gold + '55'}`,
                  borderRadius: 8, padding: '12px 16px', cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: selected?.id === a.id ? COLORS.white : COLORS.textDark }}>{a.officer_name}</div>
                <div style={{ fontSize: 12, color: selected?.id === a.id ? '#8A9BB0' : COLORS.textMid, marginTop: 2 }}>{a.display_title}</div>
                <div style={{ fontSize: 11, color: selected?.id === a.id ? '#8A9BB0' : COLORS.textLight, marginTop: 2 }}>
                  {(a.session_date || a.start_date) ? new Date((a.session_date || a.start_date) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  {a.end_date ? ` – ${new Date(a.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  {' · '}Step {a.step_number}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right - review panel */}
      <div>
        {!selected ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: COLORS.textLight, background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
            <div style={{ fontWeight: 600 }}>Select a request to review</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Request details */}
            <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ background: COLORS.navy, padding: '16px 22px' }}>
                <div style={{ color: COLORS.white, fontWeight: 700, fontSize: 16 }}>{selected.display_title}</div>
                <div style={{ color: '#8A9BB0', fontSize: 12, marginTop: 3 }}>
                  {(selected.session_date || selected.start_date) ? new Date((selected.session_date || selected.start_date) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                  {selected.end_date ? ` – ${new Date(selected.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}
                  {selected.location ? ` · ${selected.location}` : ''}
                  {selected.is_out_of_state ? ' · OUT OF STATE' : ''}
                </div>
              </div>
              <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Officer</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark }}>{selected.officer_name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textLight }}>#{selected.officer_badge} · {selected.officer_rank} · {selected.officer_unit}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Step in Chain</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDark }}>Step {selected.step_number}</div>
                  <div style={{ fontSize: 12, color: COLORS.textLight }}>{isFinal ? 'Final approver' : 'Will forward to next approver'}</div>
                </div>
              </div>
              {selected.reason && (
                <div style={{ padding: '0 22px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reason for Attending</div>
                  <div style={{ fontSize: 14, color: COLORS.textMid, lineHeight: 1.6, background: COLORS.bg, padding: '12px 14px', borderRadius: 6 }}>{selected.reason}</div>
                </div>
              )}
              {selected.officer_response && (
                <div style={{ padding: '0 22px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Officer's Response</div>
                  <div style={{ fontSize: 14, color: COLORS.textMid, lineHeight: 1.6, background: '#FFF0E0', padding: '12px 14px', borderRadius: 6, border: '1px solid #C9A84C' }}>{selected.officer_response}</div>
                </div>
              )}
              {(selected.training_cost || selected.travel_cost || selected.hotel_cost || selected.per_diem) && (
                <div style={{ padding: '0 22px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Estimated Costs</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Training', val: selected.training_cost },
                      { label: 'Travel', val: selected.travel_cost },
                      { label: 'Hotel', val: selected.hotel_cost },
                      { label: 'Per Diem', val: selected.per_diem },
                    ].filter(c => c.val).map(({ label, val }) => (
                      <div key={label} style={{ background: COLORS.bg, padding: '8px 12px', borderRadius: 6 }}>
                        <div style={{ fontSize: 11, color: COLORS.textLight, fontWeight: 600 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textDark }}>${parseFloat(val).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: COLORS.navy }}>
                    Total: ${(
                      parseFloat(selected.training_cost || 0) +
                      parseFloat(selected.travel_cost || 0) +
                      parseFloat(selected.hotel_cost || 0) +
                      parseFloat(selected.per_diem || 0)
                    ).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {previousSteps.length > 0 && (
              <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '16px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Previous Decisions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {previousSteps.map(step => (
                    <div key={step.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: COLORS.bg, borderRadius: 6 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                        background: step.decision === 'approved' ? COLORS.successLight : step.decision === 'returned' ? COLORS.warningLight : COLORS.dangerLight,
                        color: step.decision === 'approved' ? COLORS.success : step.decision === 'returned' ? COLORS.warning : COLORS.danger,
                      }}>
                        {step.decision === 'approved' ? '✓' : step.decision === 'returned' ? '↩' : '✗'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{step.approver_name}</div>
                            <div style={{ fontSize: 11, color: COLORS.textLight }}>{step.approver_rank}</div>
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.textLight }}>{step.decided_at_central}</div>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                            background: step.decision === 'approved' ? COLORS.successLight : step.decision === 'returned' ? COLORS.warningLight : COLORS.dangerLight,
                            color: step.decision === 'approved' ? COLORS.success : step.decision === 'returned' ? COLORS.warning : COLORS.danger,
                          }}>{step.decision === 'returned' ? 'Returned for Info' : step.decision}</span>
                          {step.comment && <div style={{ fontSize: 12, color: COLORS.textMid, marginTop: 4, fontStyle: 'italic' }}>"{step.comment}"</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Decision panel */}
            <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '20px 22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16 }}>Your Decision</div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button onClick={() => handleDecisionChange('approved')} style={{ flex: 1, padding: '10px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `2px solid ${decision === 'approved' ? COLORS.success : COLORS.border}`, background: decision === 'approved' ? COLORS.successLight : COLORS.white, color: decision === 'approved' ? COLORS.success : COLORS.textMid }}>Approve</button>
                <button onClick={() => handleDecisionChange('denied')} style={{ flex: 1, padding: '10px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `2px solid ${decision === 'denied' ? COLORS.danger : COLORS.border}`, background: decision === 'denied' ? COLORS.dangerLight : COLORS.white, color: decision === 'denied' ? COLORS.danger : COLORS.textMid }}>Deny</button>
                <button onClick={() => handleDecisionChange('returned')} style={{ flex: 1, padding: '10px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `2px solid ${decision === 'returned' ? COLORS.warning : COLORS.border}`, background: decision === 'returned' ? COLORS.warningLight : COLORS.white, color: decision === 'returned' ? COLORS.warning : COLORS.textMid }}>Request More Info</button>
              </div>

              {decision && decision !== 'returned' && !isFinal && !selected.is_additional && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Forward to <span style={{ color: COLORS.danger }}>*</span>
                  </div>
                  {loadingNext ? (
                    <div style={{ fontSize: 13, color: COLORS.textLight }}>Loading...</div>
                  ) : (
                    <select value={selectedNextApprover} onChange={e => setSelectedNextApprover(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 13, color: COLORS.textDark, background: COLORS.white }}>
                      <option value="">Select next approver...</option>
                      {nextApprovers.map(a => (
                        <option key={a.id} value={a.id}>{a.last_name}, {a.first_name} — {a.rank} {a.unit ? `· ${a.unit}` : ''}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {decision === 'returned' && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: COLORS.warningLight, borderRadius: 6, fontSize: 13, color: COLORS.warning }}>
                  The officer will be notified to provide more information and can resubmit their request.
                </div>
              )}

              {selected.is_additional && decision && decision !== 'returned' && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: COLORS.bg, borderRadius: 6, fontSize: 13, color: COLORS.textMid }}>
                  You were added as a consultative approver — your decision will be recorded and the chain will continue automatically.
                </div>
              )}

              {decision && decision !== 'returned' && isFinal && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: COLORS.bg, borderRadius: 6, fontSize: 13, color: COLORS.textMid }}>
                  This is the final step — the officer will be notified of the outcome.
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Comment (optional)</div>
                <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a note for the record..." style={{ width: '100%', height: 80, borderRadius: 6, border: `1px solid ${COLORS.border}`, padding: 12, fontSize: 13, resize: 'none', boxSizing: 'border-box', color: COLORS.textDark, background: COLORS.white }} />
              </div>

              {decision && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Also Add to Chain (optional)</div>
                  <select value={additionalApprover} onChange={e => setAdditionalApprover(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 13, color: COLORS.textDark, background: COLORS.white }}>
                    <option value="">No additional approver</option>
                    {allApprovers.filter(a => a.id !== user?.id).map(a => (
                      <option key={a.id} value={a.id}>{a.last_name}, {a.first_name} — {a.rank} {a.unit ? `· ${a.unit}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              <button onClick={handleSubmit} disabled={submitting || !decision} style={{ width: '100%', padding: '11px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: submitting || !decision ? 'default' : 'pointer', border: 'none', background: !decision ? COLORS.border : COLORS.navy, color: !decision ? COLORS.textLight : COLORS.white }}>
                {submitting ? 'Submitting...' : 'Submit Decision'}
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, background: toast.type === 'error' ? COLORS.dangerLight : COLORS.navy, color: toast.type === 'error' ? COLORS.danger : COLORS.white, padding: '14px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxWidth: 380, zIndex: 200, borderLeft: `4px solid ${toast.type === 'error' ? COLORS.danger : COLORS.gold}` }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
