import { useState, useEffect } from 'react'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  warning: '#B5621B', warningLight: '#FFF0E0',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

function StatusBadge({ status }) {
  const styles = {
    pending: { bg: '#FFF8E1', text: '#8A6000', label: 'Pending Approval' },
    approved: { bg: COLORS.successLight, text: COLORS.success, label: 'Approved' },
    denied: { bg: COLORS.dangerLight, text: COLORS.danger, label: 'Denied' },
    enrolled: { bg: '#E0ECF8', text: '#1A5A8A', label: 'Enrolled' },
  }
  const s = styles[status] || styles.pending
  return (
    <span style={{
      background: s.bg, color: s.text, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 4,
      textTransform: 'uppercase',
    }}>{s.label}</span>
  )
}

export default function MySchedule() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/requests')
      .then(res => setRequests(res.data.requests))
      .finally(() => setLoading(false))
  }, [])

  const handleWithdraw = async (requestId) => {
    if (!confirm('Withdraw this request?')) return
    try {
      await axios.delete(`/api/requests/${requestId}`)
      setRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (err) {
      alert(err.response?.data?.error || 'Could not withdraw request')
    }
  }

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
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
            <div key={r.id} style={{
              background: COLORS.white, border: `1px solid ${COLORS.border}`,
              borderRadius: 10, padding: '18px 22px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: COLORS.navy,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                }}>🎓</div>
                <div>
                  <div style={{ fontWeight: 700, color: COLORS.textDark, fontSize: 15 }}>{r.title}</div>
                  <div style={{ color: COLORS.textLight, fontSize: 12, marginTop: 2 }}>
                    {r.session_date ? new Date(r.session_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                    {r.location ? ` · ${r.location}` : ''}
                    {' · '}{r.request_type === 'supervisor_enrolled' ? 'Enrolled by supervisor' : 'Self-requested'}
                  </div>
                  {r.denial_note && (
                    <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 4 }}>
                      Note: {r.denial_note}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <StatusBadge status={r.status} />
                {r.status === 'pending' && (
                  <button onClick={() => handleWithdraw(r.id)} style={{
                    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: `1px solid ${COLORS.border}`,
                    background: COLORS.white, color: COLORS.textLight,
                  }}>Withdraw</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
