import { useState, useEffect } from 'react'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', navyMid: '#1B2E45', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
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
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [enrolling, setEnrolling] = useState(null)
  const [selectedTraining, setSelectedTraining] = useState(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [enrollments, setEnrollments] = useState([])

  useEffect(() => {
    axios.get('/api/trainings')
      .then(res => setTrainings(res.data.trainings))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!search || search.length < 2) {
      setSearchResults([])
      return
    }
    const timeout = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await axios.get(`/api/admin/users?search=${encodeURIComponent(search)}`)
        setSearchResults(res.data.users.filter(u => u.is_active))
      } catch (err) {
        console.error(err)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSelectTraining = async (t) => {
    setSelectedTraining(t)
    setSearch('')
    setSearchResults([])
    const res = await axios.get(`/api/trainings/${t.id}`)
    setEnrollments(res.data.enrollments)
  }

  const handleEnroll = async (officer) => {
    if (!selectedTraining) return
    setEnrolling(officer.id)
    try {
      await axios.post('/api/requests/enroll', {
        training_id: selectedTraining.id,
        officer_id: officer.id
      })
      const [tr, er] = await Promise.all([
        axios.get('/api/trainings'),
        axios.get(`/api/trainings/${selectedTraining.id}`)
      ])
      setTrainings(tr.data.trainings)
      setEnrollments(er.data.enrollments)
      const updated = tr.data.trainings.find(t => t.id === selectedTraining.id)
      if (updated) setSelectedTraining(updated)
      showToast(`${officer.first_name} ${officer.last_name} enrolled successfully.`)
      setSearch('')
      setSearchResults([])
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to enroll officer', 'error')
    } finally {
      setEnrolling(null)
    }
  }

  const handleUnenroll = async (requestId) => {
    if (!confirm('Remove this officer from the training?')) return
    try {
      await axios.delete(`/api/requests/${requestId}/unenroll`)
      setEnrollments(prev => prev.filter(e => e.id !== requestId))
      const tr = await axios.get('/api/trainings')
      setTrainings(tr.data.trainings)
      const updated = tr.data.trainings.find(t => t.id === selectedTraining?.id)
      if (updated) setSelectedTraining(updated)
      showToast('Officer unenrolled.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to unenroll', 'error')
    }
  }
  
  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

      {/* Left - training list */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: '0 0 6px' }}>Enroll Officers</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginBottom: 16 }}>Select a training then search for an officer to enroll.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trainings.map(t => {
            const isFull = !t.no_seat_limit && t.seat_capacity && parseInt(t.enrolled_count) >= t.seat_capacity
            return (
              <div
                key={t.id}
                onClick={() => !isFull && handleSelectTraining(t)}
                style={{
                  background: selectedTraining?.id === t.id ? COLORS.navy : COLORS.white,
                  border: `1.5px solid ${selectedTraining?.id === t.id ? COLORS.navy : COLORS.border}`,
                  borderRadius: 8, padding: '12px 16px',
                  cursor: isFull ? 'default' : 'pointer',
                  opacity: isFull ? 0.6 : 1,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: selectedTraining?.id === t.id ? COLORS.white : COLORS.textDark }}>{t.title}</div>
                <div style={{ fontSize: 11, color: selectedTraining?.id === t.id ? '#8A9BB0' : COLORS.textLight, marginTop: 3 }}>
                  {t.session_date ? new Date(t.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  {' · '}{t.no_seat_limit ? `${t.enrolled_count} enrolled` : `${t.enrolled_count}/${t.seat_capacity} enrolled`}
                  {isFull && ' · FULL'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right - enroll panel */}
      <div>
        {!selectedTraining ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: COLORS.textLight, background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
            <div style={{ fontWeight: 600 }}>Select a training to enroll officers</div>
          </div>
        ) : (
          <div>
            <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}>
              <div style={{ background: COLORS.navy, padding: '16px 22px' }}>
                <div style={{ color: COLORS.white, fontWeight: 700, fontSize: 16 }}>{selectedTraining.title}</div>
                <div style={{ color: '#8A9BB0', fontSize: 12, marginTop: 3 }}>
                  {selectedTraining.session_date ? new Date(selectedTraining.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                  {selectedTraining.location ? ` · ${selectedTraining.location}` : ''}
                </div>
                {!selectedTraining.no_seat_limit && selectedTraining.seat_capacity && (
                  <div style={{ marginTop: 10 }}>
                    <SeatBar enrolled={parseInt(selectedTraining.enrolled_count)} seats={selectedTraining.seat_capacity} />
                  </div>
                )}
              </div>

              <div style={{ padding: '18px 22px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textDark, marginBottom: 10 }}>Search for an officer to enroll</div>
                <div style={{ position: 'relative' }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Type a name, badge number, or unit..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 13, color: COLORS.textDark, background: COLORS.white, boxSizing: 'border-box' }}
                  />
                  {searching && <div style={{ position: 'absolute', right: 12, top: 10, fontSize: 12, color: COLORS.textLight }}>Searching...</div>}
                </div>

                {searchResults.length > 0 && (
                  <div style={{ marginTop: 8, border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden' }}>
                    {searchResults.map((o, i) => {
                      const alreadyEnrolled = enrollments.find(e => e.officer_id === o.id)
                      return (
                        <div key={o.id} className="card-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: i % 2 === 0 ? COLORS.white : COLORS.bg, borderBottom: i < searchResults.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{o.last_name}, {o.first_name}</div>
                            <div style={{ fontSize: 11, color: COLORS.textLight }}>#{o.badge_number} · {o.unit} · {o.rank}</div>
                          </div>
                          {alreadyEnrolled ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase' }}>{alreadyEnrolled.status}</span>
                          ) : (
                            <button
                              onClick={() => handleEnroll(o)}
                              disabled={enrolling === o.id}
                              style={{ padding: '6px 14px', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}
                            >{enrolling === o.id ? '...' : 'Enroll'}</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {search.length >= 2 && searchResults.length === 0 && !searching && (
                  <div style={{ marginTop: 8, padding: '10px 14px', background: COLORS.bg, borderRadius: 6, fontSize: 13, color: COLORS.textLight }}>No officers found matching "{search}"</div>
                )}
              </div>
            </div>

            {/* Current enrollments */}
            {enrollments.length > 0 && (
              <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${COLORS.border}`, fontSize: 13, fontWeight: 700, color: COLORS.navy }}>Currently Enrolled ({enrollments.length})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
                      {['Officer', 'Badge / Unit', 'Status', ''].map(h => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: i < enrollments.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{e.full_name}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: COLORS.textLight }}>#{e.badge_number} · {e.unit}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase',
                            background: e.status === 'approved' ? COLORS.successLight : e.status === 'denied' ? COLORS.dangerLight : '#FFF8E1',
                            color: e.status === 'approved' ? COLORS.success : e.status === 'denied' ? COLORS.danger : '#8A6000',
                          }}>{e.status}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <button
                            onClick={() => handleUnenroll(e.id)}
                            style={{ fontSize: 11, fontWeight: 700, color: COLORS.danger, background: 'none', border: 'none', cursor: 'pointer' }}
                          >Unenroll</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
