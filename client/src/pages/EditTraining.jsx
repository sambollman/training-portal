import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: COLORS.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}{required && <span style={{ color: COLORS.danger }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 6,
  border: `1px solid ${COLORS.border}`, fontSize: 13,
  color: COLORS.textDark, background: COLORS.white, boxSizing: 'border-box',
}

export default function EditTraining() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newFiles, setNewFiles] = useState([])
  const [existingFiles, setExistingFiles] = useState([])
  const [lessonPlanFiles, setLessonPlanFiles] = useState([])
  const [form, setForm] = useState({
    title: '', category: '', training_type: 'internal',
    session_date: '', end_date: '', start_time: '', end_time: '',
    duration_hours: '', location: '', instructor: '',
    seat_capacity: '', no_seat_limit: false, cost: '',
    is_required: false, description: '',
  })

  useEffect(() => {
    Promise.all([
      axios.get(`/api/trainings/${id}`),
      axios.get(`/api/trainings/${id}/files`),
    ]).then(([tr, fr]) => {
      const t = tr.data.training
      setForm({
        title: t.title || '',
        category: t.category || '',
        training_type: t.training_type || 'internal',
        session_date: t.session_date ? t.session_date.split('T')[0] : '',
        end_date: t.end_date ? t.end_date.split('T')[0] : '',
        start_time: t.start_time || '',
        end_time: t.end_time || '',
        duration_hours: t.duration_hours || '',
        location: t.location || '',
        instructor: t.instructor || '',
        seat_capacity: t.seat_capacity || '',
        no_seat_limit: t.no_seat_limit || false,
        cost: t.cost || '',
        is_required: t.is_required || false,
        section_number: t.section_number || '',
        is_out_of_state: t.is_out_of_state || false,
        description: t.description || '',
      })
      setExistingFiles(fr.data.files)
    }).finally(() => setLoading(false))
  }, [id])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleDeleteFile = async (fileId) => {
    if (!confirm('Delete this file?')) return
    try {
      await axios.delete(`/api/trainings/${id}/files/${fileId}`)
      setExistingFiles(prev => prev.filter(f => f.id !== fileId))
    } catch (err) {
      alert('Failed to delete file')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        ...form,
        seat_capacity: form.no_seat_limit ? null : parseInt(form.seat_capacity) || null,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : null,
        cost: form.cost ? parseFloat(form.cost) : null,
      }
      await axios.put(`/api/trainings/${id}`, payload)

      if (newFiles.length > 0) {
        const formData = new FormData()
        for (const file of newFiles) formData.append('files', file)
        formData.append('file_type', 'attachment')
        await axios.post(`/api/trainings/${id}/files`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      if (lessonPlanFiles.length > 0) {
        const formData = new FormData()
        for (const file of lessonPlanFiles) formData.append('files', file)
        formData.append('file_type', 'lesson_plan')
        await axios.post(`/api/trainings/${id}/files`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      navigate('/manage-trainings')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save training')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Edit Training</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>Update training details.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Basic Information</div>
          <Field label="Training Name" required>
            <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} required />
          </Field>
          <Field label="Section Number">
            <input style={inputStyle} value={form.section_number} onChange={e => set('section_number', e.target.value)} placeholder="From POST board" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Category">
              <input style={inputStyle} value={form.category} onChange={e => set('category', e.target.value)} />
            </Field>
            <Field label="Training Type" required>
              <select style={inputStyle} value={form.training_type} onChange={e => set('training_type', e.target.value)}>
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea style={{ ...inputStyle, height: 90, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} />
          </Field>
        </div>

        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Date & Time</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Start Date" required>
              <input type="date" style={inputStyle} value={form.session_date} onChange={e => set('session_date', e.target.value)} required />
            </Field>
            <Field label="End Date">
              <input type="date" style={inputStyle} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </Field>
            <Field label="Start Time">
              <input type="time" style={inputStyle} value={form.start_time} onChange={e => set('start_time', e.target.value)} />
            </Field>
            <Field label="End Time">
              <input type="time" style={inputStyle} value={form.end_time} onChange={e => set('end_time', e.target.value)} />
            </Field>
          </div>
          <Field label="Number of Hours">
            <input type="number" step="0.5" min="0" style={inputStyle} value={form.duration_hours} onChange={e => set('duration_hours', e.target.value)} />
          </Field>
        </div>

        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Location & Instructor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Location">
              <input style={inputStyle} value={form.location} onChange={e => set('location', e.target.value)} />
            </Field>
            <Field label="Instructor">
              <input style={inputStyle} value={form.instructor} onChange={e => set('instructor', e.target.value)} />
            </Field>
          </div>
        </div>

        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Enrollment & Cost</div>
          {form.training_type === 'internal' && (
            <Field label="Number of Attendees">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="number" min="1" style={{ ...inputStyle, flex: 1 }}
                  value={form.no_seat_limit ? '' : form.seat_capacity}
                  onChange={e => set('seat_capacity', e.target.value)}
                  disabled={form.no_seat_limit}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.textMid, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.no_seat_limit} onChange={e => set('no_seat_limit', e.target.checked)} />
                  No limit
                </label>
              </div>
            </Field>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Cost per Attendee ($)">
              <input type="number" step="0.01" min="0" style={inputStyle} value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Options">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.textMid, cursor: 'pointer', marginTop: 8 }}>
                <input type="checkbox" checked={form.is_required} onChange={e => set('is_required', e.target.checked)} />
                Mark as required training
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.textMid, cursor: 'pointer', marginTop: 8 }}>
                <input type="checkbox" checked={form.is_out_of_state} onChange={e => set('is_out_of_state', e.target.checked)} />
                Out of state training
              </label>
            </Field>
          </div>
        </div>

        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Attachments</div>
  
          <Field label="Flyers / General Attachments">
            <input
              type="file" multiple
              onChange={e => setNewFiles(Array.from(e.target.files))}
              style={{ fontSize: 13, color: COLORS.textMid, display: 'block', width: '100%', padding: '8px', borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: 'pointer', boxSizing: 'border-box' }}
            />
            {newFiles.length > 0 && (
                <div style={{ marginTop: 8 }}>
                {newFiles.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>📎 {f.name}</div>
                 ))}
                </div>
            )}
          </Field>

          <Field label="Lesson Plan">
            <input
              type="file" multiple
              onChange={e => setLessonPlanFiles(Array.from(e.target.files))}
              style={{ fontSize: 13, color: COLORS.textMid, display: 'block', width: '100%', padding: '8px', borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.bg, cursor: 'pointer', boxSizing: 'border-box' }}
            />
            {lessonPlanFiles.length > 0 && (
                <div style={{ marginTop: 8 }}>
                {lessonPlanFiles.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>📋 {f.name}</div>
                ))}
              </div>
            )}
          </Field>

          {existingFiles.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Current Files</div>
              {existingFiles.map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: COLORS.bg, borderRadius: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: COLORS.textMid }}>{f.file_type === 'lesson_plan' ? '📋' : '📎'} {f.original_name} <span style={{ fontSize: 11, color: COLORS.textLight }}>({f.file_type === 'lesson_plan' ? 'Lesson Plan' : 'Attachment'})</span></span>
                  <button type="button" onClick={() => handleDeleteFile(f.id)} style={{ fontSize: 11, fontWeight: 700, color: COLORS.danger, background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: COLORS.dangerLight, color: COLORS.danger, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => navigate('/manage-trainings')} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Cancel</button>
          <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  )
}
