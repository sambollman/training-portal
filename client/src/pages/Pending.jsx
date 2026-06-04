
import { useState, useEffect } from 'react'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

export default function Pending() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [denialModal, setDenialModal] = useState(null)
  const [denialNote, setDenialNote] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    axios.get('/api/requests/pending')
      .then(res => setRequests(res.data.requests))
      .finally(() => setLoading(false))
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleApprove = async (requestId) => {
    try {
      await axios.patch(`/api/requests/${requestId}/approve`)
      setRequests(prev => prev.filter(r => r.id !== requestId))
      showToast('Request approved.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to approve', 'error')
    }
  }

  const handleDeny = async () => {
    try {
      await axios.patch(`/api/requests/${denialModal.id}/deny`, { denial_note: denialNote })
      setRequests(prev => prev.filter(r => r.id !== denialModal.id))
      setDenialModal(null)
      setDenialNote('')
      showToast('Request denied.', 'warning')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to deny', 'error')
    }
  }

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Pending Approvals</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>Review and approve or deny training requests from your officers.</p>
      </div>

      {requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textLight, background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>All caught up!</div>
          <div style={{ fontSize: 13 }}>No pending requests at this time.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map(r => (
            <div key={r.id} style={{
              background: COLORS.white, border: `1.5px solid ${COLORS.gold}55`,
              borderRadius: 10, padding: '18px 22px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', background: '#E8ECF2',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                  }}>👤</div>
                  <div>
                    <div style={{ fontWeight: 700, color: COLORS.textDark, fontSize: 15 }}>{r.full_name}</div>
                    <div style={{ color: COLORS.textLight, fontSize: 12 }}>
                      Requesting: <strong style={{ color: COLORS.textMid }}>{r.title}</strong>
                    </div>
                    <div style={{ color: COLORS.textLight, fontSize: 11, marginTop: 2 }}>
                      {r.session_date ? new Date(r.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                      {r.location ? ` · ${r.location}` : ''}
                      {' · '}Badge #{r.badge_number} · {r.unit}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => handleApprove(r.id)} style={{
                    padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', border: 'none', background: COLORS.success, color: COLORS.white,
                  }}>Approve</button>
                  <button onClick={() => setDenialModal(r)} style={{
                    padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', border: `1.5px solid ${COLORS.danger}`,
                    background: 'transparent', color: COLORS.danger,
                  }}>Deny</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {denialModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: COLORS.white, borderRadius: 12, padding: 32, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.danger, marginBottom: 8 }}>Deny Request</div>
            <p style={{ color: COLORS.textMid, fontSize: 14, marginBottom: 16 }}>
              Denying <strong>{denialModal.full_name}</strong>'s request for <strong>{denialModal.title}</strong>. Optionally add a note.
            </p>
            <textarea
              value={denialNote}
              onChange={e => setDenialNote(e.target.value)}
              placeholder="Reason for denial (optional)..."
              style={{ width: '100%', height: 90, borderRadius: 6, border: `1px solid ${COLORS.border}`, padding: 12, fontSize: 13, resize: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setDenialModal(null); setDenialNote('') }} style={{
                padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid,
              }}>Cancel</button>
              <button onClick={handleDeny} style={{
                padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', border: 'none', background: COLORS.danger, color: COLORS.white,
              }}>Confirm Denial</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          background: toast.type === 'error' ? COLORS.dangerLight : COLORS.navy,
          color: toast.type === 'error' ? COLORS.danger : COLORS.white,
          padding: '14px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxWidth: 380, zIndex: 200,
          borderLeft: `4px solid ${toast.type === 'error' ? COLORS.danger : COLORS.gold}`
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
