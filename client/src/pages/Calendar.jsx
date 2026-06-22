import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function Calendar() {
  const navigate = useNavigate()
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [trainings, setTrainings] = useState([])
  const [specialized, setSpecialized] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      axios.get('/api/trainings'),
      axios.get(`/api/specialized?year=${currentYear}&month=${currentMonth + 1}`),
    ]).then(([tr, sr]) => {
      setTrainings(tr.data.trainings)
      setSpecialized(sr.data.trainings)
    }).finally(() => setLoading(false))
  }, [currentYear, currentMonth])

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  // Build calendar grid
  const firstDay = new Date(currentYear, currentMonth, 1).getDay()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Get events for a day
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
        events.push({
          id: t.id,
          title: t.title,
          type: t.training_type === 'external' ? 'external' : 'internal',
          source: 'portal',
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
        events.push({
          id: s.id,
          title: s.title,
          type: 'specialized',
          source: 'specialized',
        })
      }
    })

    return events
  }

  const isToday = (day) => {
    return day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Training Calendar</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, marginRight: 16 }}>
            {[
              { label: 'Internal', type: 'internal' },
              { label: 'External', type: 'external' },
              { label: 'Specialized', type: 'specialized' },
            ].map(({ label, type }) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: EVENT_COLORS[type].bg, border: `1.5px solid ${EVENT_COLORS[type].border}` }} />
                <span style={{ fontSize: 12, color: COLORS.textMid }}>{label}</span>
              </div>
            ))}
          </div>
          <button onClick={prevMonth} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>←</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.navy, minWidth: 180, textAlign: 'center' }}>{MONTHS[currentMonth]} {currentYear}</span>
          <button onClick={nextMonth} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>→</button>
        </div>
      </div>

      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${COLORS.border}` }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', background: COLORS.bg }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const events = getEventsForDay(day)
            const todayStyle = isToday(day)
            return (
              <div key={i} style={{
                minHeight: 110, padding: '6px', borderRight: (i + 1) % 7 !== 0 ? `1px solid ${COLORS.border}` : 'none',
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
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 4,
                    }}>{day}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {events.slice(0, 3).map((event, ei) => {
                        const ec = EVENT_COLORS[event.type]
                        return (
                          <div
                            key={ei}
                            onClick={() => event.source === 'portal' && navigate(`/trainings/${event.id}`)}
                            style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                              background: ec.bg, color: ec.text,
                              border: `1px solid ${ec.border}44`,
                              cursor: event.source === 'portal' ? 'pointer' : 'default',
                              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            }}
                          >
                            {event.title}
                          </div>
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
    </div>
  )
}