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
