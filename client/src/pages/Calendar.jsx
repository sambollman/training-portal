import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
  danger: '#9B2335', dangerLight: '#FDECEA',
}

const EVENT_COLORS = {
  internal: { bg: '#D8F3DC', text: '#2D6A4F', border: '#2D6A4F' },
  external: { bg: '#FDECEA', text: '#9B2335', border: '#9B2335' },
  specialized: { bg: '#E0ECF8', text: '#1A5A8A', border: '#1A5A8A' },
  civilian: { bg: '#FFF9C4', text: '#7A6200', border: '#C9A84C' },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const UNIT_TYPES = ['SWAT', 'CMT', 'K9']

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${COLORS.border}`, fontSize: 13,
  color: COLORS.textDark, background: COLORS.white, boxSizing: 'border-box',
}

export default function Calendar() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [trainings, setTrainings] = useState([])
  const [specialized, setSpecialized] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [selectedSpecialized, setSelectedSpecialized] = useState(null)
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 })
  const [myRequests, setMyRequests] = useState([])
  const [form, setForm] = useState({
    title: '',
    unit_type: 'SWAT',
    training_type: 'specialized',
    start_datetime: '',
    end_datetime: '',
    description: '',
    location: '',
    is_recurring: false,
    recurrence_pattern: 'weekly',
    recurrence_end_date: '',
  })

  useEffect(() => {
    setLoading(true)
    Promise.all([
      axios.get('/api/trainings/calendar'),
      axios.get(`/api/specialized?year=${currentYear}&month=${currentMonth + 1}`),
      axios.get('/api/requests'),
    ]).then(([tr, sr, rr]) => {
      setTrainings(tr.data.trainings)
      setSpecialized(sr.data.trainings)
      setMyRequests(rr.data.requests)
    }).finally(() => setLoading(false))
  }, [currentYear, currentMonth])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        start_datetime: form.start_datetime ? new Date(form.start_datetime).toISOString() : null,
        end_datetime: form.end_datetime ? new Date(form.end_datetime).toISOString() : null,
      }
      await axios.post('/api/specialized', payload)
      const sr = await axios.get(`/api/specialized?year=${currentYear}&month=${currentMonth + 1}`)
      setSpecialized(sr.data.trainings)
      setShowModal(false)
      setForm({
        title: '', unit_type: 'SWAT', training_type: 'specialized',
        start_datetime: '', end_datetime: '', description: '', location: '',
        is_recurring: false, recurrence_pattern: 'weekly', recurrence_end_date: '',
      })
      showToast('Training added to calendar.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add training', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSpecialized = async (id) => {
    if (!confirm('Delete this training from the calendar?')) return
    try {
      await axios.delete(`/api/specialized/${id}`)
      setSpecialized(prev => prev.filter(s => s.id !== id))
      setSelectedSpecialized(null)
      showToast('Training removed from calendar.')
    } catch (err) {
      showToast('Failed to delete', 'error')
    }
  }

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  const firstDay = new Date(currentYear, currentMonth, 1).getDay()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const getEventsForDay = (day) => {
    if (!day) return []
    const events = []
    const cellDate = new Date(currentYear, currentMonth, day)

    trainings.forEach(t => {
      if (!t.session_date) return
      const start = new Date(t.session_date + 'T12:00:00')
      const end = t.end_date ? new Date(t.end_date + 'T12:00:00') : start
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      if (cellDate >= startDay && cellDate <= endDay) {
        const enrolled = myRequests.find(r => r.training_id === t.id)
        events.push({
          id: t.id, title: t.title,
          type: t.training_type === 'external' ? 'external' : t.training_type === 'civilian' ? 'civilian' : 'internal',
          source: 'portal',
          enrolled: !!enrolled,
          enrolledStatus: enrolled?.status,
        })
      }
    })

    specialized.forEach(s => {
      if (!s.start_datetime) return
      const start = new Date(s.start_datetime)
      const end = s.end_datetime ? new Date(s.end_datetime) : start
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      if (cellDate >= startDay && cellDate <= endDay) {
        events.push({ id: s.id, title: s.title, type: 'specialized', source: 'specialized' })
      }
    })

    return events
  }

  const isToday = (day) => day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Training Calendar</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 12, marginRight: 8 }}>
            {[
              { label: 'Internal', type: 'internal' },
              { label: 'External', type: 'external' },
              { label: 'Specialized', type: 'specialized' },
              { label: 'Civilian', type: 'civilian' },
            ].map(({ label, type }) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: EVENT_COLORS[type].bg, border: `1.5px solid ${EVENT_COLORS[type].border}` }} />
                <span style={{ fontSize: 12, color: COLORS.textMid }}>{label}</span>
              </div>
            ))}
          </div>
          {user?.role === 'coordinator' && (
            <button onClick={() => setShowModal(true)} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>+ Add to Calendar</button>
          )}
          <button onClick={prevMonth} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>←</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.navy, minWidth: 180, textAlign: 'center' }}>{MONTHS[currentMonth]} {currentYear}</span>
          <button onClick={nextMonth} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>→</button>
        </div>
      </div>

      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${COLORS.border}` }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', background: COLORS.bg }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const events = getEventsForDay(day)
            const todayStyle = isToday(day)
            return (
              <div key={i} style={{
                minHeight: 110, padding: '6px',
                borderRight: (i + 1) % 7 !== 0 ? `1px solid ${COLORS.border}` : 'none',
                borderBottom: i < cells.length - 7 ? `1px solid ${COLORS.border}` : 'none',
                background: day ? COLORS.white : COLORS.bg,
              }}>
                {day && (
                  <>
                    <div style={{
                      fontSize: 13, fontWeight: todayStyle ? 700 : 500,
                      color: todayStyle ? COLORS.white : COLORS.textMid,
                      width: 26, height: 26, borderRadius: '50%',
                      background: todayStyle ? COLORS.navy : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
                    }}>{day}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {events.slice(0, 3).map((event, ei) => {
                        const ec = EVENT_COLORS[event.type]
                        return (
                          <div key={ei} onClick={(e) => {
                            if (event.source === 'portal') {
                              navigate(`/trainings/${event.id}`)
                            } else if (event.source === 'specialized') {
                              setPopoverPos({ x: e.clientX, y: e.clientY })
                              setSelectedSpecialized(event.data || specialized.find(s => s.id === event.id))
                            }
                          }} style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                            background: ec.bg, color: ec.text,
                            border: event.enrolled ? `2px solid ${ec.border}` : `1px solid ${ec.border}44`,
                            boxShadow: event.enrolled ? `0 0 0 1px ${ec.border}` : 'none',
                            cursor: event.source === 'portal' ? 'pointer' : 'default',
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                          }}>{event.enrolled ? '✓ ' : ''}{event.title}</div>
                        )
                      })}
                      {events.length > 3 && (
                        <div style={{ fontSize: 10, color: COLORS.textLight, paddingLeft: 6 }}>+{events.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: COLORS.white, borderRadius: 12, padding: 32, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.navy, marginBottom: 20 }}>Add to Calendar</div>
            <form onSubmit={handleSubmit}>
              <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Title *</label>
                  <input required style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Type</label>
                  <select style={inputStyle} value={form.training_type} onChange={e => set('training_type', e.target.value)}>
                    <option value="specialized">Specialized Unit</option>
                    <option value="civilian">Civilian</option>
                  </select>
                </div>
                {form.training_type === 'specialized' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Unit</label>
                    <select style={inputStyle} value={form.unit_type} onChange={e => set('unit_type', e.target.value)}>
                      {UNIT_TYPES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Start Date & Time *</label>
                  <input required type="datetime-local" style={inputStyle} value={form.start_datetime} onChange={e => set('start_datetime', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>End Date & Time</label>
                  <input type="datetime-local" style={inputStyle} value={form.end_datetime} onChange={e => set('end_datetime', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Location</label>
                  <input style={inputStyle} value={form.location} onChange={e => set('location', e.target.value)} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Description</label>
                  <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.textMid, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.is_recurring} onChange={e => set('is_recurring', e.target.checked)} />
                    Recurring training
                  </label>
                </div>
                {form.is_recurring && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Repeats</label>
                      <select style={inputStyle} value={form.recurrence_pattern} onChange={e => set('recurrence_pattern', e.target.value)}>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Every 2 Weeks</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Repeat Until</label>
                      <input type="date" style={inputStyle} value={form.recurrence_end_date} onChange={e => set('recurrence_end_date', e.target.value)} />
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>
                  {saving ? 'Saving...' : 'Add to Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedSpecialized && (
        <div onClick={() => setSelectedSpecialized(null)} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'fixed',
            left: Math.min(popoverPos.x, window.innerWidth - 300),
            top: Math.min(popoverPos.y + 10, window.innerHeight - 250),
            background: COLORS.white, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, padding: 16, width: 280,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.textDark, flex: 1 }}>{selectedSpecialized.title}</div>
              <button onClick={() => setSelectedSpecialized(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textLight, fontSize: 16, padding: 0, marginLeft: 8 }}>×</button>
            </div>
            {selectedSpecialized.unit_type && <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>Unit: {selectedSpecialized.unit_type}</div>}
            {selectedSpecialized.location && <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>Location: {selectedSpecialized.location}</div>}
            {selectedSpecialized.start_datetime && (
              <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>
                Start: {selectedSpecialized.start_datetime_central ? new Date(selectedSpecialized.start_datetime_central + ':00').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
              </div>
            )}
            {selectedSpecialized.end_datetime && (
              <div style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>
                End: {selectedSpecialized.end_datetime_central ? new Date(selectedSpecialized.end_datetime_central + ':00').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
              </div>
            )}
            {selectedSpecialized.description && <div style={{ fontSize: 12, color: COLORS.textMid, marginTop: 8, fontStyle: 'italic' }}>{selectedSpecialized.description}</div>}
                        {user?.role === 'coordinator' && (
                          <button
                            onClick={() => handleDeleteSpecialized(selectedSpecialized.id)}
                            style={{ marginTop: 12, width: '100%', padding: '7px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${COLORS.danger}`, background: 'transparent', color: COLORS.danger }}
                          >Delete from Calendar</button>
                        )}
                      </div>
                    </div>
                  )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, background: toast.type === 'error' ? COLORS.dangerLight : COLORS.navy, color: toast.type === 'error' ? COLORS.danger : COLORS.white, padding: '14px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxWidth: 380, zIndex: 200, borderLeft: `4px solid ${toast.type === 'error' ? COLORS.danger : COLORS.gold}` }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
