import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

const STATUS_STYLES = {
  pending: { bg: '#FFF8E1', text: '#8A6000', label: 'Pending' },
  approved: { bg: COLORS.successLight, text: COLORS.success, label: 'Approved' },
  denied: { bg: COLORS.dangerLight, text: COLORS.danger, label: 'Denied' },
  enrolled: { bg: '#E0ECF8', text: '#1A5A8A', label: 'Enrolled' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending
  return (
    <span style={{
      background: s.bg, color: s.text, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 4,
      textTransform: 'uppercase',
    }}>{s.label}</span>
  )
}

export default function AllRequests() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [trainings, setTrainings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedRosterTraining, setSelectedRosterTraining] = useState('')

  useEffect(() => {
    Promise.all([
      axios.get('/api/requests/all'),
      axios.get('/api/trainings'),
    ]).then(([rr, tr]) => {
      setRequests(rr.data.requests)
      setTrainings(tr.data.trainings)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>All Requests</h1>
          <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>Full history of training requests from your unit.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'pending', 'approved', 'denied'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: `1.5px solid ${filter === f ? COLORS.navy : COLORS.border}`,
              background: filter === f ? COLORS.navy : COLORS.white,
              color: filter === f ? COLORS.white : COLORS.textMid,
              textTransform: 'capitalize',
            }}>{f}</button>
          ))}
        </div>
      </div>

      {user.role === 'coordinator' && (
        <div style={{
          background: COLORS.white, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: '18px 22px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textDark, whiteSpace: 'nowrap' }}>⬇ Download Roster</div>
          <select
            value={selectedRosterTraining}
            onChange={e => setSelectedRosterTraining(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 13, color: COLORS.textDark, background: COLORS.white }}
          >
            <option value="">Select a training...</option>
            {trainings.map(t => (
              <option key={t.id} value={t.id}>
                {t.title} — {t.session_date ? new Date(t.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
              </option>
            ))}
          </select>
          
            href={selectedRosterTraining ? `/api/trainings/${selectedRosterTraining}/roster` : '#'}
            download
            onClick={e => !selectedRosterTraining && e.preventDefault()}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700,
              border: 'none', textDecoration: 'none',
              background: selectedRosterTraining ? COLORS.navy : COLORS.border,
              color: selectedRosterTraining ? COLORS.white : COLORS.textLight,
              cursor: 'pointer',
              opacity: selectedRosterTraining ? 1 : 0.4,
              whiteSpace: 'nowrap',
            }}
          >Download CSV</a>
        </div>
      )}

      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: COLORS.textLight }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 600 }}>No requests found</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
                {['Officer', 'Training', 'Date', 'Type', 'Status'].map(h => (
                  <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: 600, color: COLORS.textDark, fontSize: 13 }}>{r.full_name}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight }}>#{r.badge_number} · {r.unit}</div>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: 13, color: COLORS.textMid }}>{r.title}</td>
                  <td style={{ padding: '14px 18px', fontSize: 13, color: COLORS.textMid }}>
                    {r.session_date ? new Date(r.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: 12, color: COLORS.textLight }}>
                    {r.request_type === 'supervisor_enrolled' ? 'Supervisor enrolled' : 'Self-requested'}
                  </td>
                  <td style={{ padding: '14px 18px' }}><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
