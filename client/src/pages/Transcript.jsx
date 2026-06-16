import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${COLORS.border}`, fontSize: 13,
  color: COLORS.textDark, background: COLORS.white, boxSizing: 'border-box',
}

const STATUS_OPTIONS = ['Attended', 'Partial Attendance', 'Did Not Attend']
const TYPE_OPTIONS = ['internal', 'external']

function RecordRow({ record, onUpdate, onUpload, onDeleteCert }) {
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    training_title: record.training_title || '',
    training_type: record.training_type || 'internal',
    training_date: record.training_date || '',
    end_date: record.end_date || '',
    completion_date: record.completion_date || '',
    location: record.location || '',
    instructor: record.instructor || '',
    hours: record.hours || '',
    cost: record.cost || '',
    status: record.status || 'Attended',
    certified: record.certified || false,
    certification_name: record.certification_name || '',
    certification_expiration: record.certification_expiration || '',
    certification_hours: record.certification_hours || '',
    score: record.score || '',
    remarks: record.remarks || '',
  })
  const [files, setFiles] = useState([])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    await onUpdate(record.id, form)
    setEditing(false)
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    const formData = new FormData()
    for (const file of files) formData.append('certificates', file)
    await onUpload(record.id, formData)
    setFiles([])
    setUploading(false)
  }

  const sourceLabel = record.source === 'portal' ? 'Portal' : record.source === 'external' ? 'External' : 'Manual'
  const sourceBg = record.source === 'portal' ? '#E0ECF8' : record.source === 'external' ? '#FFF0E0' : COLORS.bg
  const sourceColor = record.source === 'portal' ? '#1A5A8A' : record.source === 'external' ? '#B5621B' : COLORS.textMid

  const statusColor = (status) => {
    if (status === 'Attended') return { bg: COLORS.successLight, text: COLORS.success }
    if (status === 'Did Not Attend') return { bg: COLORS.dangerLight, text: COLORS.danger }
    return { bg: '#FFF8E1', text: '#8A6000' }
  }
  const sc = statusColor(record.status)

  return (
    <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.textDark }}>{record.training_title}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', background: sourceBg, color: sourceColor }}>{sourceLabel}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', background: sc.bg, color: sc.text }}>{record.status || 'Attended'}</span>
            {record.certified && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', background: COLORS.successLight, color: COLORS.success }}>Certified</span>}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {record.training_date && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Date:</strong> {new Date(record.training_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
            {record.end_date && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>End:</strong> {new Date(record.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
            {record.location && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Location:</strong> {record.location}</div>}
            {record.instructor && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Instructor:</strong> {record.instructor}</div>}
            {record.hours && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Hours:</strong> {record.hours}</div>}
            {record.cost && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Cost:</strong> ${parseFloat(record.cost).toFixed(2)}</div>}
            {record.score && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Score:</strong> {record.score}</div>}
            {record.certification_name && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Cert:</strong> {record.certification_name}</div>}
            {record.certification_hours && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Cert Hours:</strong> {record.certification_hours}</div>}
            {record.certification_expiration && <div style={{ fontSize: 12, color: COLORS.textLight }}><strong>Expires:</strong> {new Date(record.certification_expiration + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          </div>
          {record.remarks && <div style={{ fontSize: 12, color: COLORS.textMid, marginTop: 6, fontStyle: 'italic' }}>{record.remarks}</div>}
        </div>
        <button onClick={() => setEditing(!editing)} style={{ fontSize: 12, fontWeight: 600, color: COLORS.navy, background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', marginLeft: 12, flexShrink: 0 }}>
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {record.certificates && record.certificates.length > 0 && (
        <div style={{ padding: '0 20px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Certificates</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {record.certificates.map(cert => (
              <div key={cert.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: COLORS.bg, borderRadius: 6 }}>
                <span style={{ fontSize: 16 }}>📎</span>
                <span style={{ fontSize: 13, color: COLORS.textDark, flex: 1 }}>{cert.original_name}</span>
                <button onClick={() => window.open(`/api/transcript/record/${record.id}/certificates/${cert.id}`)} style={{ fontSize: 11, fontWeight: 700, color: COLORS.gold, background: 'none', border: 'none', cursor: 'pointer' }}>Download</button>
                <button onClick={() => onDeleteCert(record.id, cert.id)} style={{ fontSize: 11, fontWeight: 700, color: COLORS.danger, background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 20px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Upload Certificate</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files))} style={{ fontSize: 12, color: COLORS.textMid, flex: 1, background: COLORS.white }} />
          {files.length > 0 && (
            <button onClick={handleUpload} disabled={uploading} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white, flexShrink: 0 }}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Training Title</label>
              <input style={inputStyle} value={form.training_title} onChange={e => set('training_title', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Type</label>
              <select style={inputStyle} value={form.training_type} onChange={e => set('training_type', e.target.value)}>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Status</label>
              <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Start Date</label>
              <input type="date" style={inputStyle} value={form.training_date} onChange={e => set('training_date', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>End Date</label>
              <input type="date" style={inputStyle} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Location</label>
              <input style={inputStyle} value={form.location} onChange={e => set('location', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Instructor</label>
              <input style={inputStyle} value={form.instructor} onChange={e => set('instructor', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Hours</label>
              <input type="number" step="0.5" style={inputStyle} value={form.hours} onChange={e => set('hours', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Cost ($)</label>
              <input type="number" step="0.01" style={inputStyle} value={form.cost} onChange={e => set('cost', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Score</label>
              <input style={inputStyle} value={form.score} onChange={e => set('score', e.target.value)} placeholder="e.g. 95% or Pass" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Certification Name</label>
              <input style={inputStyle} value={form.certification_name} onChange={e => set('certification_name', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Cert Hours</label>
              <input type="number" step="0.5" style={inputStyle} value={form.certification_hours} onChange={e => set('certification_hours', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Cert Expiration</label>
              <input type="date" style={inputStyle} value={form.certification_expiration} onChange={e => set('certification_expiration', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.textMid, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.certified} onChange={e => set('certified', e.target.checked)} />
                This training resulted in a certification
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Remarks</label>
              <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }} value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => setEditing(false)} style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Cancel</button>
            <button onClick={handleSave} style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>Save Changes</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Transcript() {
  const { officerId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [officerName, setOfficerName] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({
    training_title: '', training_type: 'internal', training_date: '',
    end_date: '', completion_date: '', location: '', instructor: '',
    hours: '', cost: '', status: 'Attended', certified: false,
    certification_name: '', certification_expiration: '',
    certification_hours: '', score: '', remarks: ''
  })
  const [toast, setToast] = useState(null)

  const targetId = officerId || user.id

  useEffect(() => {
    axios.get(`/api/transcript/${targetId}`)
      .then(res => setRecords(res.data.records))
      .finally(() => setLoading(false))

    if (officerId && officerId !== user.id) {
      axios.get(`/api/admin/users/${officerId}`)
        .then(res => setOfficerName(res.data.user.full_name))
        .catch(() => {})
    }
  }, [targetId])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleUpdate = async (recordId, form) => {
    try {
      const res = await axios.put(`/api/transcript/record/${recordId}`, form)
      setRecords(prev => prev.map(r => r.id === recordId ? { ...res.data.record, certificates: r.certificates } : r))
      showToast('Record updated.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update', 'error')
    }
  }

  const handleUpload = async (recordId, formData) => {
    try {
      const res = await axios.post(`/api/transcript/record/${recordId}/certificates`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setRecords(prev => prev.map(r => r.id === recordId ? { ...r, certificates: [...(r.certificates || []), ...res.data.certificates] } : r))
      showToast('Certificate uploaded.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to upload', 'error')
    }
  }

  const handleDeleteCert = async (recordId, certId) => {
    if (!confirm('Delete this certificate?')) return
    try {
      await axios.delete(`/api/transcript/record/${recordId}/certificates/${certId}`)
      setRecords(prev => prev.map(r => r.id === recordId ? { ...r, certificates: r.certificates.filter(c => c.id !== certId) } : r))
      showToast('Certificate removed.')
    } catch (err) {
      showToast('Failed to delete', 'error')
    }
  }

  const handleAddRecord = async (e) => {
    e.preventDefault()
    try {
      const res = await axios.post(`/api/transcript/${targetId}/record`, addForm)
      const newRecord = { ...res.data.record, certificates: [] }
      setRecords(prev => [newRecord, ...prev])
      setShowAddForm(false)
      setAddForm({
        training_title: '', training_type: 'internal', training_date: '',
        end_date: '', completion_date: '', location: '', instructor: '',
        hours: '', cost: '', status: 'Attended', certified: false,
        certification_name: '', certification_expiration: '',
        certification_hours: '', score: '', remarks: ''
      })
      showToast('Training record added.')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add record', 'error')
    }
  }

  const totalHours = records.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0)

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>
            {officerName ? `${officerName} — Training Transcript` : 'My Training Transcript'}
          </h1>
          <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>
            {records.length} training{records.length !== 1 ? 's' : ''} · {totalHours.toFixed(1)} total hours
          </p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>
          + Add Record
        </button>
      </div>

      {showAddForm && (
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.navy, marginBottom: 16 }}>Add Training Record</div>
          <form onSubmit={handleAddRecord}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Training Title *</label>
                <input required style={inputStyle} value={addForm.training_title} onChange={e => setAddForm(p => ({ ...p, training_title: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Type</label>
                <select style={inputStyle} value={addForm.training_type} onChange={e => setAddForm(p => ({ ...p, training_type: e.target.value }))}>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Status</label>
                <select style={inputStyle} value={addForm.status} onChange={e => setAddForm(p => ({ ...p, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Start Date</label>
                <input type="date" style={inputStyle} value={addForm.training_date} onChange={e => setAddForm(p => ({ ...p, training_date: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>End Date</label>
                <input type="date" style={inputStyle} value={addForm.end_date} onChange={e => setAddForm(p => ({ ...p, end_date: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Location</label>
                <input style={inputStyle} value={addForm.location} onChange={e => setAddForm(p => ({ ...p, location: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Instructor</label>
                <input style={inputStyle} value={addForm.instructor} onChange={e => setAddForm(p => ({ ...p, instructor: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Hours</label>
                <input type="number" step="0.5" style={inputStyle} value={addForm.hours} onChange={e => setAddForm(p => ({ ...p, hours: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Cost ($)</label>
                <input type="number" step="0.01" style={inputStyle} value={addForm.cost} onChange={e => setAddForm(p => ({ ...p, cost: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Score</label>
                <input style={inputStyle} value={addForm.score} onChange={e => setAddForm(p => ({ ...p, score: e.target.value }))} placeholder="e.g. 95% or Pass" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Certification Name</label>
                <input style={inputStyle} value={addForm.certification_name} onChange={e => setAddForm(p => ({ ...p, certification_name: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Cert Hours</label>
                <input type="number" step="0.5" style={inputStyle} value={addForm.certification_hours} onChange={e => setAddForm(p => ({ ...p, certification_hours: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Cert Expiration</label>
                <input type="date" style={inputStyle} value={addForm.certification_expiration} onChange={e => setAddForm(p => ({ ...p, certification_expiration: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.textMid, cursor: 'pointer' }}>
                  <input type="checkbox" checked={addForm.certified} onChange={e => setAddForm(p => ({ ...p, certified: e.target.checked }))} />
                  This training resulted in a certification
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Remarks</label>
                <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }} value={addForm.remarks} onChange={e => setAddForm(p => ({ ...p, remarks: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Cancel</button>
              <button type="submit" style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>Add Record</button>
            </div>
          </form>
        </div>
      )}

      {records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textLight, background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>No training records yet</div>
          <div style={{ fontSize: 13 }}>Records are created automatically when attendance is marked, or you can add them manually.</div>
        </div>
      ) : (
        records.map(record => (
          <RecordRow
            key={record.id}
            record={record}
            onUpdate={handleUpdate}
            onUpload={handleUpload}
            onDeleteCert={handleDeleteCert}
          />
        ))
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, background: toast.type === 'error' ? COLORS.dangerLight : COLORS.navy, color: toast.type === 'error' ? COLORS.danger : COLORS.white, padding: '14px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxWidth: 380, zIndex: 200, borderLeft: `4px solid ${toast.type === 'error' ? COLORS.danger : COLORS.gold}` }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}