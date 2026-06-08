import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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

export default function RequestTraining() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [approvers, setApprovers] = useState([])
  const [form, setForm] = useState({
    training_name: '',
    organization: '',
    location: '',
    is_out_of_state: false,
    start_date: '',
    end_date: '',
    duration_hours: '',
    training_cost: '',
    travel_cost: '',
    hotel_cost: '',
    per_diem: '',
    website: '',
    reason: '',
    first_approver_id: '',
  })

  useEffect(() => {
    axios.get('/api/approvals/first-approvers')
      .then(res => setApprovers(res.data.approvers))
      .catch(() => setError('Could not load approvers'))
  }, [])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.first_approver_id) { setError('Please select an approver'); return }
    setError('')
    setSaving(true)
    try {
      const payload = {
        ...form,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : null,
        training_cost: form.training_cost ? parseFloat(form.training_cost) : null,
        travel_cost: form.travel_cost ? parseFloat(form.travel_cost) : null,
        hotel_cost: form.hotel_cost ? parseFloat(form.hotel_cost) : null,
        per_diem: form.per_diem ? parseFloat(form.per_diem) : null,
      }
      await axios.post('/api/external/submit', payload)
      navigate('/my-schedule')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request')
    } finally {
      setSaving(false)
    }
  }

  const totalCost = (
    parseFloat(form.training_cost || 0) +
    parseFloat(form.travel_cost || 0) +
    parseFloat(form.hotel_cost || 0) +
    parseFloat(form.per_diem || 0)
  ).toFixed(2)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Request a Training</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>Found a training not listed in the portal? Submit it for approval here.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Training Information</div>

          <Field label="Training Name" required>
            <input style={inputStyle} value={form.training_name} onChange={e => set('training_name', e.target.value)} required />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Organization / Provider">
              <input style={inputStyle} value={form.organization} onChange={e => set('organization', e.target.value)} placeholder="e.g. ILEA, FBI Academy" />
            </Field>
            <Field label="Website / Link">
              <input style={inputStyle} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://..." />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Location">
              <input style={inputStyle} value={form.location} onChange={e => set('location', e.target.value)} />
            </Field>
            <Field label="Options">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.textMid, cursor: 'pointer', marginTop: 8 }}>
                <input type="checkbox" checked={form.is_out_of_state} onChange={e => set('is_out_of_state', e.target.checked)} />
                Out of state training
              </label>
            </Field>
          </div>
        </div>

        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Date & Duration</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Field label="Start Date">
              <input type="date" style={inputStyle} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </Field>
            <Field label="End Date">
              <input type="date" style={inputStyle} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </Field>
            <Field label="Duration (hours)">
              <input type="number" step="0.5" min="0" style={inputStyle} value={form.duration_hours} onChange={e => set('duration_hours', e.target.value)} placeholder="e.g. 8" />
            </Field>
          </div>
        </div>

        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Estimated Costs</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Training Cost ($)">
              <input type="number" step="0.01" min="0" style={inputStyle} value={form.training_cost} onChange={e => set('training_cost', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Travel Cost ($)">
              <input type="number" step="0.01" min="0" style={inputStyle} value={form.travel_cost} onChange={e => set('travel_cost', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Hotel Cost ($)">
              <input type="number" step="0.01" min="0" style={inputStyle} value={form.hotel_cost} onChange={e => set('hotel_cost', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Per Diem ($)">
              <input type="number" step="0.01" min="0" style={inputStyle} value={form.per_diem} onChange={e => set('per_diem', e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          {parseFloat(totalCost) > 0 && (
            <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: COLORS.navy }}>
              Total Estimated Cost: ${totalCost}
            </div>
          )}
        </div>

        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Justification & Approval</div>

          <Field label="Why do you want to attend?">
            <textarea
              style={{ ...inputStyle, height: 90, resize: 'vertical' }}
              value={form.reason}
              onChange={e => set('reason', e.target.value)}
              placeholder="Explain how this training benefits your role..."
            />
          </Field>

          <Field label="Send request to" required>
            <select style={inputStyle} value={form.first_approver_id} onChange={e => set('first_approver_id', e.target.value)} required>
              <option value="">Select an approver...</option>
              {approvers.map(a => (
                <option key={a.id} value={a.id}>
                  {a.last_name}, {a.first_name} — {a.rank} {a.unit ? `· ${a.unit}` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && (
          <div style={{ background: COLORS.dangerLight, color: COLORS.danger, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => navigate(-1)} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Cancel</button>
          <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>
            {saving ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  )
}