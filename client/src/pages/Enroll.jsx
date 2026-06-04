import { useState, useEffect } from 'react'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
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

export default function Enroll() {
  const [trainings, setTrainings] = useState([])
  const [officers, setOfficers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [enrolling, setEnrolling] = useState(null)

  useEffect(() => {
    Promise.all([
      axios.get('/api/trainings'),
      axios.get('/api/users/my-unit')
    ]).then(([tr, ur]) => {
      setTrainings(tr.data.trainings)
      setOfficers(ur.data.users)
    }).finally(() => setLoading(false))
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleEnroll = async (trainingId, officerId, officerName, trainingTitle) => {
    setEnrolling(`${trainingId}-${officerId}`)
    try {
      await axios.post('/api/requests/enroll', { training_id: trainingId, officer_id: officerId })
      const tr = await axios.get('/api/trainings')
      setTrainings(tr.data.trainings)
      showToast(`${officerName} enrolled in "${trainingTitle}"`)
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to enroll officer', 'error')
    } finally {
      setEnrolling(null)
    }
  }

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Enroll Officers</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>Directly enroll your officers in required or recommended trainings.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {trainings.map(t => {
          const isFull = parseInt(t.enrolled_count) >= t.seat_capacity
          return (
            <div key={t.id} style={{
              background: COLORS.white, border: `1px solid ${COLORS.border}`,
              borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              <div style={{ background: COLORS.navy, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    {t.category && <div style={{ fontSize: 11, color: '#8A9BB0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.category}</div>}
                    <div style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 14, marginTop: 4 }}>{t.title}</div>
                    <div style={{ color: '#8A9BB0', fontSize: 12, marginTop: 2 }}>
                      {t.session_date ? new Date(t.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      {t.duration_hours ? ` · ${t.duration_hours} hrs` : ''}
                    </div>
                  </div>
                  {t.is_required && (
                    <span style={{ background: '#FFF0E0', color: '#B5621B', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>Required</span>
                  )}
                </div>
              </div>
              <div style={{ padding: '14px 18px' }}>
                <SeatBar enrolled={parseInt(t.enrolled_count)} seats={t.seat_capacity} />
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>Select Officer to Enroll</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {officers.map(o => {
                      const key = `${t.id}-${o.id}`
                      const isEnrolling = enrolling === key
                      return (
                        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: COLORS.bg, borderRadius: 6 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{o.full_name}</div>
                            <div style={{ fontSize: 11, color: COLORS.textLight }}>#{o.badge_number} · {o.unit}</div>
                          </div>
                          <button
                            disabled={isFull || isEnrolling}
                            onClick={() => handleEnroll(t.id, o.id, o.full_name, t.title)}
                            style={{
                              padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                              cursor: isFull ? 'default' : 'pointer', border: 'none',
                              background: isFull ? COLORS.border : COLORS.navy,
                              color: isFull ? COLORS.textLight : COLORS.white,
                            }}
                          >{isEnrolling ? '...' : isFull ? 'Full' : 'Enroll'}</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

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
