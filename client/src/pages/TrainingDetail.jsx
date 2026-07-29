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

function RequestForm({ trainingId, userRank, trainingData, onSuccess, onCancel }) {
  const [reason, setReason] = useState('')
  const [approvers, setApprovers] = useState([])
  const [selectedApprover, setSelectedApprover] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [trainingCost, setTrainingCost] = useState(trainingData?.cost ? parseFloat(trainingData.cost).toFixed(2) : '')
  const [travelCost, setTravelCost] = useState('')
  const [hotelCost, setHotelCost] = useState('')
  const [perDiem, setPerDiem] = useState('')

  useEffect(() => {
    axios.get('/api/approvals/first-approvers')
      .then(res => setApprovers(res.data.approvers))
      .catch(() => setError('Could not load approvers'))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedApprover) { setError('Please select an approver'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await axios.post('/api/approvals/submit', {
        training_id: trainingId,
        reason,
        first_approver_id: selectedApprover,
        training_cost: trainingCost || null,
        travel_cost: travelCost || null,
        hotel_cost: hotelCost || null,
        per_diem: perDiem || null,
      })
      onSuccess(res.data.request)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 6,
    border: `1px solid ${COLORS.border}`, fontSize: 13,
    color: COLORS.textDark, background: COLORS.white, boxSizing: 'border-box',
  }

  return (
    <div style={{ background: COLORS.bg, borderRadius: 8, padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.navy, marginBottom: 16 }}>Request to Attend</div>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Why do you want to attend?
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Explain how this training benefits your role..."
            style={{ ...inputStyle, height: 80, resize: 'vertical' }}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estimated Costs</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Training Cost ($)', value: trainingCost, set: setTrainingCost },
              { label: 'Travel Cost ($)', value: travelCost, set: setTravelCost },
              { label: 'Hotel Cost ($)', value: hotelCost, set: setHotelCost },
              { label: 'Per Diem ($)', value: perDiem, set: setPerDiem },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: COLORS.textLight, marginBottom: 4 }}>{label}</label>
                <input
                  type="number" step="0.01" min="0"
                  value={value}
                  onChange={e => set(e.target.value)}
                  style={{ ...inputStyle }}
                  placeholder="0.00"
                />
              </div>
            ))}
          </div>
          {(trainingCost || travelCost || hotelCost || perDiem) && (
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: COLORS.navy }}>
              Total Estimated: ${(
                parseFloat(trainingCost || 0) +
                parseFloat(travelCost || 0) +
                parseFloat(hotelCost || 0) +
                parseFloat(perDiem || 0)
              ).toFixed(2)}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Send request to <span style={{ color: COLORS.danger }}>*</span>
          </label>
          <select
            value={selectedApprover}
            onChange={e => setSelectedApprover(e.target.value)}
            required
            style={inputStyle}
          >
            <option value="">Select an approver...</option>
            {approvers.map(a => (
              <option key={a.id} value={a.id}>
                {a.last_name}, {a.first_name} — {a.rank} {a.unit ? `· ${a.unit}` : ''}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div style={{ background: COLORS.dangerLight, color: COLORS.danger, padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Cancel</button>
          <button type="submit" disabled={submitting} style={{ padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
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
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [toast, setToast] = useState(null)
  const [showRequestForm, setShowRequestForm] = useState(false)

  useEffect(() => {
    Promise.all([
      axios.get(`/api/trainings/${id}`),
      axios.get(`/api/trainings/${id}/files`),
      axios.get('/api/requests'),
    ]).then(([tr, fr, rr]) => {
      setTraining(tr.data.training)
      setFiles(fr.data.files)
      setEnrollments(tr.data.enrollments || [])
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

  const formatDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'
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
        Back to Trainings
      </button>

      <div style={{ background: COLORS.navy, borderRadius: '10px 10px 0 0', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {training.category && <div style={{ fontSize: 11, color: COLORS.silver, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{training.category}</div>}
          <h1 style={{ color: COLORS.white, fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>{training.title}</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            {training.is_required && <span style={{ background: '#FFF0E0', color: '#B5621B', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>Required</span>}
            {training.is_out_of_state && <span style={{ background: '#E0ECF8', color: '#1A5A8A', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>Out of State</span>}
            <span style={{ background: COLORS.navyMid, color: COLORS.silver, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>{training.training_type}</span>
          </div>
        </div>
        {user.role === 'coordinator' && (
          <button onClick={() => navigate(`/edit-training/${id}`)} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${COLORS.silver}`, background: 'transparent', color: COLORS.silver }}>Edit</button>
        )}
      </div>

      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 20, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
          <InfoBlock label="Start Date" value={formatDate(training.session_date)} />
          {training.end_date && <InfoBlock label="End Date" value={formatDate(training.end_date)} />}
          <InfoBlock label="Start Time" value={formatTime(training.start_time)} />
          {training.end_time && <InfoBlock label="End Time" value={formatTime(training.end_time)} />}
          <InfoBlock label="Duration" value={training.duration_hours ? `${training.duration_hours} hours` : '—'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
          <InfoBlock label="Location" value={training.location} />
          <InfoBlock label="Instructor" value={training.instructors && training.instructors.length > 0 ? training.instructors.map(i => `${i.first_name} ${i.last_name}`).join(', ') : training.instructor || '—'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
          <InfoBlock label="Seats" value={training.no_seat_limit ? 'No limit' : `${training.enrolled_count} / ${training.seat_capacity} enrolled`} />
          <InfoBlock label="Cost per Attendee" value={training.cost ? `$${parseFloat(training.cost).toFixed(2)}` : 'Free'} />
        </div>

        {training.description && (
          <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>Description</div>
            <p style={{ fontSize: 14, color: COLORS.textMid, lineHeight: 1.6, margin: 0 }}>{training.description}</p>
          </div>
        )}

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
            </div>
          </div>
        )}
        
        {user && (
          <div>
            {myRequest ? (
              <div style={{ padding: '14px 18px', borderRadius: 8, background: myRequest.status === 'approved' ? COLORS.successLight : myRequest.status === 'denied' ? COLORS.dangerLight : '#FFF8E1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: myRequest.status === 'approved' ? COLORS.success : myRequest.status === 'denied' ? COLORS.danger : '#8A6000' }}>
                  {myRequest.status === 'approved' ? 'Request Approved' : myRequest.status === 'denied' ? 'Request Denied' : 'Request In Progress'}
                </div>
                {myRequest.denial_note && <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 4 }}>Note: {myRequest.denial_note}</div>}
              </div>
            ) : training.is_closed ? (
              <div style={{ padding: '14px 18px', borderRadius: 8, background: COLORS.bg, color: COLORS.textLight, fontWeight: 600, fontSize: 14, textAlign: 'center' }}>This training is closed — no longer accepting requests</div>  
            ) : isFull ? (
              <div style={{ padding: '14px 18px', borderRadius: 8, background: COLORS.bg, color: COLORS.textLight, fontWeight: 600, fontSize: 14, textAlign: 'center' }}>This session is full</div>
            ) : showRequestForm ? (
              <RequestForm
                trainingId={id}
                userId={user.id}
                userRank={user.rank}
                trainingData={training}
                onSuccess={(req) => { setMyRequest(req); setShowRequestForm(false); showToast('Request submitted successfully.') }}
                onCancel={() => setShowRequestForm(false)}
              />
            ) : (
              <button onClick={() => setShowRequestForm(true)} style={{ width: '100%', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>
                Request to Attend
              </button>
            )}
          </div>
        )}
      </div>
      {enrollments && enrollments.length > 0 && (user.role === 'supervisor' || user.role === 'coordinator') && (
          <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>Currently Enrolled ({enrollments.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {enrollments.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: COLORS.bg, borderRadius: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>{e.full_name}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight }}>#{e.badge_number} · {e.unit}</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase',
                    background: e.status === 'approved' ? COLORS.successLight : e.status === 'denied' ? COLORS.dangerLight : '#FFF8E1',
                    color: e.status === 'approved' ? COLORS.success : e.status === 'denied' ? COLORS.danger : '#8A6000',
                  }}>{e.status}</span>
                </div>
              ))}
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
