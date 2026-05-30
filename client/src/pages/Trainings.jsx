import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', navyMid: '#1B2E45', gold: '#C9A84C',
  silver: '#8A9BB0', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A',
  textMid: '#3D5166', textLight: '#6B7F96',
}

function Badge({ children, color = 'default' }) {
  const styles = {
    default: { bg: '#E8ECF2', text: COLORS.textMid },
    required: { bg: '#FFF0E0', text: '#B5621B' },
    full: { bg: COLORS.dangerLight, text: COLORS.danger },
  }
  const s = styles[color] || styles.default
  return (
    <span style={{
      background: s.bg, color: s.text, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 4,
      textTransform: 'uppercase',
    }}>{children}</span>
  )
}

function SeatBar({ enrolled, seats }) {
  const pct = Math.min(100, Math.round((enrolled / seats) * 100))
  const color = pct >= 100 ? COLORS.danger : pct >= 80 ? '#B5621B' : COLORS.success
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: COLORS.textLight, marginBottom: 4 }}>
        <span>{enrolled}/{seats} seats</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: COLORS.border, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  )
}

export default function Trainings() {
  const { user } = useAuth()
  const [trainings, setTrainings] = useState([])
  const [loading, setLoading] = useState(true)
  const [myRequests, setMyRequests] = useState([])
  const [filter, setFilter] = useState('All')
  const [toast, setToast] = useState(null)
  const [requesting, setRequesting] = useState(null)

  useEffect(() => {
    Promise.all([
      axios.get('/api/trainings'),
      axios.get('/api/requests')
    ]).then(([tr, rr]) => {
      setTrainings(tr.data.trainings)
      setMyRequests(rr.data.requests)
    }).finally(() => setLoading(false))
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleRequest = async (training) => {
    setRequesting(training.id)
    try {
      await axios.post('/api/requests', { training_id: training.id })
      const res = await axios.get('/api/requests')
      setMyRequests(res.data.requests)
      showToast(`Request submitted for "${training.title}"`)
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit request', 'error')
    } finally {
      setRequesting(null)
    }
  }

  const categories = ['All', ...Array.from(new Set(trainings.map(t => t.category).filter(Boolean)))]
  const filtered = filter === 'All' ? trainings : trainings.filter(t => t.category === filter)

  const getEnrollmentStatus = (trainingId) => {
    return myRequests.find(r => r.training_id === trainingId)
  }

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Available Trainings</h1>
          <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>Browse upcoming sessions and request to attend.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: `1.5px solid ${filter === cat ? COLORS.navy : COLORS.border}`,
              background: filter === cat ? COLORS.navy : COLORS.white,
              color: filter === cat ? COLORS.white : COLORS.textMid,
            }}>{cat}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textLight }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600 }}>No trainings available</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(t => {
            const isFull = !t.no_seat_limit && t.seat_capacity && parseInt(t.enrolled_count) >= t.seat_capacity
            const enrollment = getEnrollmentStatus(t.id)
            const isRequesting = requesting === t.id

            return (
              <div key={t.id} style={{
                background: COLORS.white, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column'
              }}>
                <div style={{ background: COLORS.navy, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      {t.category && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.silver, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {t.category}
                        </span>
                      )}
                      <div style={{ color: COLORS.white, fontWeight: 700, fontSize: 15, marginTop: 4 }}>{t.title}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      {t.is_required && <Badge color="required">Required</Badge>}
                      {isFull && <Badge color="full">Full</Badge>}
                    </div>
                  </div>
                </div>
                <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Date', val: t.session_date ? new Date(t.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                      { label: 'Duration', val: t.duration_hours ? `${t.duration_hours} hrs` : '—' },
                      { label: 'Location', val: t.location || '—' },
                      { label: 'Instructor', val: t.instructor || '—' },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: COLORS.textLight, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, color: COLORS.textDark, fontWeight: 500 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {t.description && (
                    <p style={{ fontSize: 12, color: COLORS.textMid, margin: 0, lineHeight: 1.5 }}>
                      {t.description}
                    </p>
                  )}
                  <SeatBar enrolled={parseInt(t.enrolled_count)} seats={t.seat_capacity} />
                  {user.role === 'officer' && (
                    <button
                      onClick={() => !enrollment && !isFull && handleRequest(t)}
                      disabled={!!enrollment || isFull || isRequesting}
                      style={{
                        marginTop: 'auto', width: '100%', padding: '9px', borderRadius: 6,
                        fontSize: 13, fontWeight: 700, border: 'none',
                        cursor: enrollment || isFull ? 'default' : 'pointer',
                        background: enrollment?.status === 'approved' ? '#D8F3DC' : enrollment?.status === 'denied' ? '#FDECEA' : enrollment?.status === 'pending' ? '#FFF8E1' : isFull ? COLORS.bg : COLORS.navy,
                        color: enrollment?.status === 'approved' ? '#2D6A4F' : enrollment?.status === 'denied' ? '#9B2335' : enrollment?.status === 'pending' ? '#8A6000' : isFull ? COLORS.textLight : COLORS.white,
                        
                      }}
                    >
                      {isRequesting ? 'Submitting...' : enrollment?.status === 'approved' ? '✓ Approved' : enrollment?.status === 'denied' ? '✗ Denied' : enrollment?.status === 'pending' ? '⏳ Pending Approval' : isFull ? 'Session Full' : 'Request to Attend →'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
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
