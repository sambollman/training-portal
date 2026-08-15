import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const COLORS = {
  navy: '#0D1B2A', navyMid: '#1B2E45', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
  silver: '#8A9BB0',
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

export default function ManageTrainings() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [trainings, setTrainings] = useState([])
  const [selected, setSelected] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [markingAttendance, setMarkingAttendance] = useState(null)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [fullHistory, setFullHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    setHistoryLoading(true)
    axios.get('/api/trainings/all', { params: fullHistory ? { fullHistory: 'true' } : {} })
      .then(res => setTrainings(res.data.trainings))
      .finally(() => { setLoading(false); setHistoryLoading(false) })
  }, [fullHistory])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSelectTraining = async (training) => {
    setSelected(training)
    setEnrollLoading(true)
    try {
      const res = await axios.get(`/api/trainings/${training.id}`)
      setEnrollments(res.data.enrollments)
    } catch (err) {
      showToast('Failed to load enrollments', 'error')
    } finally {
      setEnrollLoading(false)
    }
  }

  const handleAttendance = async (requestId, attended) => {
    setMarkingAttendance(requestId)
    try {
      await axios.patch(`/api/requests/${requestId}/attendance`, { attended })
      setEnrollments(prev => prev.map(e => e.id === requestId ? { ...e, attended } : e))
      showToast('Attendance marked.')
    } catch (err) {
      showToast('Failed to mark attendance', 'error')
    } finally {
      setMarkingAttendance(null)
    }
  }

  const handleArchive = async (trainingId) => {
    if (!confirm('Archive this training? It will no longer appear in the available list.')) return
    try {
      await axios.delete(`/api/trainings/${trainingId}`)
      setTrainings(prev => prev.filter(t => t.id !== trainingId))
      setSelected(null)
      setEnrollments([])
      showToast('Training archived.')
    } catch (err) {
      showToast('Failed to archive training', 'error')
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const filteredTrainings = trainings.filter(t => {
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase())) return false
    if (typeFilter !== 'all' && t.training_type !== typeFilter) return false
    if (dateFilter === 'upcoming' && t.session_date && new Date(t.session_date + 'T12:00:00') < today) return false
    if (dateFilter === 'past' && t.session_date && new Date(t.session_date + 'T12:00:00') >= today) return false
    return true
  })

  const handleToggleClose = async (training) => {
  const newState = !training.is_closed
  try {
    await axios.patch(`/api/trainings/${training.id}/close`, { is_closed: newState })
    setTrainings(prev => prev.map(t => t.id === training.id ? { ...t, is_closed: newState } : t))
    setSelected(prev => prev ? { ...prev, is_closed: newState } : prev)
    showToast(newState ? 'Training closed — no new requests accepted.' : 'Training reopened.')
  } catch (err) {
    showToast('Failed to update training', 'error')
  }
}

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div className="split-layout" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>

      <div>
        <div className="card-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: '0 0 6px' }}>Manage Trainings</h1>
            <p style={{ color: COLORS.textLight, fontSize: 13, margin: 0 }}>Select a training to view enrollments and export a roster.</p>
          </div>
          <button onClick={() => navigate('/create-training')} style={{
            padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700,
            background: COLORS.navy, color: COLORS.white, border: 'none',
            cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 12,
          }}>+ New Training</button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <input
            placeholder="Search trainings..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${COLORS.border}`, fontSize: 13, color: COLORS.textDark, background: COLORS.white, boxSizing: 'border-box', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {[
              { label: 'All', value: 'all' },
              { label: 'Upcoming', value: 'upcoming' },
              { label: 'Past', value: 'past' },
            ].map(({ label, value }) => (
              <button key={value} onClick={() => setDateFilter(value)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${dateFilter === value ? COLORS.navy : COLORS.border}`, background: dateFilter === value ? COLORS.navy : COLORS.white, color: dateFilter === value ? COLORS.white : COLORS.textMid }}>
                {label}
              </button>
            ))}
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid, cursor: 'pointer' }}>
              <option value="all">All Types</option>
              <option value="internal">Internal</option>
              <option value="external">External</option>
            </select>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textLight }}>
            {historyLoading ? 'Loading…' : `${filteredTrainings.length} of ${trainings.length} trainings`}
            {' · '}
            {fullHistory ? (
              <span>Showing full history — <a onClick={() => setFullHistory(false)} style={{ color: COLORS.navy, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>show recent only</a></span>
            ) : (
              <span>Showing upcoming + last 90 days — <a onClick={() => setFullHistory(true)} style={{ color: COLORS.navy, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>show full history</a></span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTrainings.map(t => (
            <div
              key={t.id}
              onClick={() => handleSelectTraining(t)}
              style={{
                background: selected?.id === t.id ? COLORS.navy : COLORS.white,
                border: `1.5px solid ${selected?.id === t.id ? COLORS.navy : COLORS.border}`,
                borderRadius: 8, padding: '12px 16px', cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: selected?.id === t.id ? COLORS.white : COLORS.textDark }}>{t.title}</div>
              <div style={{ fontSize: 11, color: selected?.id === t.id ? COLORS.silver : COLORS.textLight, marginTop: 3 }}>
                {t.session_date ? new Date(t.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                {' · '}{t.enrolled_count}/{t.seat_capacity || '∞'} enrolled
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {!selected ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: COLORS.textLight, background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
            <div style={{ fontWeight: 600 }}>Select a training to view details</div>
          </div>
        ) : (
          <div>
            <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}>
              <div className="card-row" style={{ background: COLORS.navy, padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: COLORS.white, fontWeight: 700, fontSize: 16 }}>{selected.title}</div>
                  <div style={{ color: COLORS.silver, fontSize: 12, marginTop: 3 }}>
                    {selected.session_date ? new Date(selected.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                    {selected.location ? ` · ${selected.location}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => window.open(`/api/trainings/${selected.id}/roster`)}
                    style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${COLORS.gold}`, background: 'transparent', color: COLORS.gold }}
                  >⬇ Export Roster</button>
                  {user?.role === 'coordinator' && (
                    <>
                      <button
                        onClick={() => navigate(`/edit-training/${selected.id}`)}
                        style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${COLORS.silver}`, background: 'transparent', color: COLORS.silver }}
                      >✏ Edit</button>
                      <button
                        onClick={() => handleToggleClose(selected)}
                        style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${selected.is_closed ? COLORS.success : COLORS.warning || '#B5621B'}`, background: 'transparent', color: selected.is_closed ? COLORS.success : '#B5621B' }}
                      >{selected.is_closed ? '🔓 Reopen' : '🔒 Close'}</button>
                      <button
                        onClick={() => handleArchive(selected.id)}
                        style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${COLORS.danger}`, background: 'transparent', color: COLORS.danger }}
                      >Archive</button>
                    </>
                  )}
                </div>
              </div>

              {enrollLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: COLORS.textLight }}>Loading enrollments...</div>
              ) : enrollments.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: COLORS.textLight }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
                  <div style={{ fontWeight: 600 }}>No officers enrolled yet</div>
                </div>
              ) : (
                <>
                <table className="table-view" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
                      {['Officer', 'Badge', 'Unit', 'Status', 'Attended', ''].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: i < enrollments.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: COLORS.textDark, fontSize: 13 }}>{e.full_name}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>#{e.badge_number}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{e.unit}</td>
                        <td style={{ padding: '12px 16px' }}><StatusBadge status={e.status} /></td>
                        <td style={{ padding: '12px 16px' }}>
                          {e.status === 'approved' || e.status === 'enrolled' ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleAttendance(e.id, true)}
                                disabled={markingAttendance === e.id}
                                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: e.attended === true ? COLORS.success : COLORS.bg, color: e.attended === true ? COLORS.white : COLORS.textMid }}
                              >Yes</button>
                              <button
                                onClick={() => handleAttendance(e.id, false)}
                                disabled={markingAttendance === e.id}
                                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: e.attended === false ? COLORS.danger : COLORS.bg, color: e.attended === false ? COLORS.white : COLORS.textMid }}
                              >No</button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: COLORS.textLight }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => handleUnenroll(e.id)}
                            style={{ fontSize: 11, fontWeight: 700, color: COLORS.danger, background: 'none', border: 'none', cursor: 'pointer' }}
                          >Unenroll</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="card-list-view">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {enrollments.map(e => (
                      <div key={e.id} style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.textDark }}>{e.full_name}</div>
                            <div style={{ fontSize: 12, color: COLORS.textMid }}>#{e.badge_number} · {e.unit}</div>
                          </div>
                          <StatusBadge status={e.status} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {e.status === 'approved' || e.status === 'enrolled' ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: COLORS.textLight, marginRight: 2 }}>Attended:</span>
                              <button
                                onClick={() => handleAttendance(e.id, true)}
                                disabled={markingAttendance === e.id}
                                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: e.attended === true ? COLORS.success : COLORS.bg, color: e.attended === true ? COLORS.white : COLORS.textMid }}
                              >Yes</button>
                              <button
                                onClick={() => handleAttendance(e.id, false)}
                                disabled={markingAttendance === e.id}
                                style={{ padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: e.attended === false ? COLORS.danger : COLORS.bg, color: e.attended === false ? COLORS.white : COLORS.textMid }}
                              >No</button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: COLORS.textLight }}>—</span>
                          )}
                          <button
                            onClick={() => handleUnenroll(e.id)}
                            style={{ fontSize: 11, fontWeight: 700, color: COLORS.danger, background: 'none', border: 'none', cursor: 'pointer' }}
                          >Unenroll</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                </>
              )}
            </div>
          </div>
        )}
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
