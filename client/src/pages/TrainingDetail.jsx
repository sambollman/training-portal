import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', navyMid: '#1B2E45', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
  silver: '#8A9BB0',
}

function InfoBlock({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: COLORS.textDark, fontWeight: 500 }}>{value || '—'}</div>
    </div>
  )
}

export default function TrainingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [training, setTraining] = useState(null)
  const [files, setFiles] = useState([])
  const [myRequest, setMyRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    Promise.all([
      axios.get(`/api/trainings/${id}`),
      axios.get(`/api/trainings/${id}/files`),
      axios.get('/api/requests'),
    ]).then(([tr, fr, rr]) => {
      setTraining(tr.data.training)
      setFiles(fr.data.files)
      const existing = rr.data.requests.find(r => r.training_id === id)
      setMyRequest(existing || null)
    }).finally(() => setLoading(false))
  }, [id])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleRequest = async () => {
    setRequesting(true)
    try {
      await axios.post('/api/requests', { training_id: id })
      const res = await axios.get('/api/requests')
      const existing = res.data.requests.find(r => r.training_id === id)
      setMyRequest(existing || null)
      showToast('Request submitted — pending supervisor approval.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to submit request', 'error')
    } finally {
      setRequesting(false)
    }
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'
  const formatTime = (t) => {
    if (!t) return '—'
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const isFull = training && !training.no_seat_limit && training.seat_capacity && parseInt(training.enrolled_count) >= training.seat_capacity

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>
  if (!training) return <div style={{ padding: 40, color: COLORS.danger }}>Training not found.</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => navigate('/trainings')} style={{ background: 'none', border: 'none', color: COLORS.textLight, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        ← Back to Trainings
      </button>

      {/* Header */}
      <div style={{ background: COLORS.navy, borderRadius: '10px 10px 0 0', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {training.category && <div style={{ fontSize: 11, color: COLORS.silver, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{training.category}</div>}
          <h1 style={{ color: COLORS.white, fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>{training.title}</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            {training.is_required && <span style={{ background: '#FFF0E0', color: '#B5621B', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>Required</span>}
            <span style={{ background: training.training_type === 'external' ? '#E0ECF8' : COLORS.navyMid, color: training.training_type === 'external' ? '#1A5A8A' : COLORS.silver, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>{training.training_type}</span>
          </div>
        </div>
        {user.role === 'coordinator' && (
          <button onClick={() => navigate(`/edit-training/${id}`)} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${COLORS.silver}`, background: 'transparent', color: COLORS.silver }}>✏ Edit</button>
        )}
      </div>

      {/* Body */}
      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

        {/* Date & Time */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
          <InfoBlock label="Start Date" value={formatDate(training.session_date)} />
          {training.end_date && <InfoBlock label="End Date" value={formatDate(training.end_date)} />}
          <InfoBlock label="Start Time" value={formatTime(training.start_time)} />
          {training.end_time && <InfoBlock label="End Time" value={formatTime(training.end_time)} />}
          <InfoBlock label="Duration" value={training.duration_hours ? `${training.duration_hours} hours` : '—'} />
        </div>

        {/* Location & Instructor */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
          <InfoBlock label="Location" value={training.location} />
          <InfoBlock label="Instructor" value={training.instructor} />
        </div>

        {/* Enrollment */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
          <InfoBlock label="Seats" value={training.no_seat_limit ? 'No limit' : `${training.enrolled_count} / ${training.seat_capacity} enrolled`} />
          <InfoBlock label="Cost per Attendee" value={training.cost ? `$${parseFloat(training.cost).toFixed(2)}` : 'Free'} />
        </div>

        {/* Description */}
        {training.description && (
          <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>Description</div>
            <p style={{ fontSize: 14, color: COLORS.textMid, lineHeight: 1.6, margin: 0 }}>{training.description}</p>
          </div>
        )}

        {/* Files */}
        {files.length > 0 && (
          <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>Attachments</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {files.map(f => (
                <button
                  key={f.id}
                  onClick={() => window.open(`/api/trainings/${id}/files/${f.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}`, width: '100%', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 18 }}>📎</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{f.original_name}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight }}>{(f.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: COLORS.gold, fontWeight: 700 }}>Download</span>
                </button>
              ))}
              ))}
            </div>
          </div>
        )}

        {/* Request button */}
        {user.role === 'officer' && (
          <div>
            {myRequest ? (
              <div style={{ padding: '14px 18px', borderRadius: 8, background: myRequest.status === 'approved' ? COLORS.successLight : myRequest.status === 'denied' ? COLORS.dangerLight : '#FFF8E1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: myRequest.status === 'approved' ? COLORS.success : myRequest.status === 'denied' ? COLORS.danger : '#8A6000' }}>
                    {myRequest.status === 'approved' ? '✓ Request Approved' : myRequest.status === 'denied' ? '✗ Request Denied' : '⏳ Pending Approval'}
                  </div>
                  {myRequest.denial_note && <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 4 }}>Note: {myRequest.denial_note}</div>}
                </div>
              </div>
            ) : isFull ? (
              <div style={{ padding: '14px 18px', borderRadius: 8, background: COLORS.bg, color: COLORS.textLight, fontWeight: 600, fontSize: 14, textAlign: 'center' }}>This session is full</div>
            ) : (
              <button onClick={handleRequest} disabled={requesting} style={{ width: '100%', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: requesting ? 'default' : 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>
                {requesting ? 'Submitting...' : 'Request to Attend →'}
              </button>
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
