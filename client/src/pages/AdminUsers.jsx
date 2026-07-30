//TEST
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

const RANKS = ['Civilian', 'Officer', 'Manager', 'Sergeant', 'Lieutenant', 'Captain', 'Assistant Chief', 'Chief']
const ROLES = ['civilian', 'officer', 'instructor', 'supervisor', 'coordinator']

const emptyForm = {
  first_name: '', last_name: '', email: '',
  badge_number: '', post_license_number: '', unit: '',
  rank: 'Officer', role: 'officer', is_active: true,
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}{required && <span style={{ color: COLORS.danger }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: `1px solid ${COLORS.border}`, fontSize: 13,
  color: COLORS.textDark, background: COLORS.white, boxSizing: 'border-box',
}

export default function AdminUsers() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState(null)

  useEffect(() => {
    axios.get('/api/admin/users')
      .then(res => setUsers(res.data.users))
      .finally(() => setLoading(false))
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const openCreate = () => {
    setForm(emptyForm)
    setEditingUser(null)
    setError('')
    setModal('create')
  }

  const openEdit = (user) => {
    setForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      badge_number: user.badge_number || '',
      post_license_number: user.post_license_number || '',
      unit: user.unit || '',
      rank: user.rank || 'Officer',
      role: user.role || 'officer',
      is_active: user.is_active !== false,
    })
    setEditingUser(user)
    setError('')
    setModal('edit')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = { ...form, username: form.email, supervisor_id: form.supervisor_id || null }
      if (modal === 'create') {
        const res = await axios.post('/api/admin/users', payload)
        setUsers(prev => [...prev, res.data.user].sort((a, b) => a.last_name?.localeCompare(b.last_name)))
        showToast(`${res.data.user.full_name} added successfully.`)
      } else {
        const res = await axios.put(`/api/admin/users/${editingUser.id}`, payload)
        setUsers(prev => prev.map(u => u.id === editingUser.id ? res.data.user : u))
        showToast(`${res.data.user.full_name} updated successfully.`)
      }
      setModal(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  const filtered = users.filter(u =>
    !search ||
    u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.badge_number?.includes(search) ||
    u.unit?.toLowerCase().includes(search.toLowerCase())
  )

  const roleColor = (role) => {
    if (role === 'coordinator') return { bg: '#E0ECF8', text: '#1A5A8A' }
    if (role === 'supervisor') return { bg: COLORS.successLight, text: COLORS.success }
    return { bg: '#F0F3F7', text: COLORS.textMid }
  }

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>User Management</h1>
          <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>{users.length} members · {users.filter(u => u.is_active).length} active</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowImport(!showImport)} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>⬆ Bulk Import</button>
          <button onClick={openCreate} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>+ Add Member</button>
        </div>
      </div>

      {showImport && (
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 8 }}>Bulk Import Users</div>
          <p style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 12 }}>Upload an Excel file with two columns: "Last, First" name and ND.gov username. Existing users will be matched by name or ND.gov username and updated. New users will be created with Officer role.</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="file" accept=".xlsx,.xls"
              onChange={e => setImportFile(e.target.files[0])}
              style={{ fontSize: 13, color: COLORS.textMid, flex: 1, padding: '8px', borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.white, cursor: 'pointer' }}
            />
            <button
              onClick={async () => {
                if (!importFile) return
                setImporting(true)
                setImportResults(null)
                try {
                  const formData = new FormData()
                  formData.append('file', importFile)
                  const res = await axios.post('/api/import/users', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
                  setImportResults(res.data.results)
                  const ur = await axios.get('/api/admin/users')
                  setUsers(ur.data.users)
                } catch (err) {
                  showToast(err.response?.data?.error || 'Import failed', 'error')
                } finally {
                  setImporting(false)
                }
              }}
              disabled={importing || !importFile}
              style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: importing || !importFile ? 'default' : 'pointer', border: 'none', background: !importFile ? COLORS.border : COLORS.navy, color: !importFile ? COLORS.textLight : COLORS.white, whiteSpace: 'nowrap' }}
            >{importing ? 'Importing...' : 'Import'}</button>
          </div>
          {importResults && (
            <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
              {[
                { label: 'Added', value: importResults.imported, color: COLORS.success, bg: '#D8F3DC' },
                { label: 'Updated', value: importResults.updated, color: '#1A5A8A', bg: '#E0ECF8' },
                { label: 'Invalid Rows', value: importResults.skipped_invalid, color: COLORS.warning, bg: '#FFF0E0' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 8, padding: '10px 16px', textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: 11, color: COLORS.textLight, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Search by name, badge, or unit..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, maxWidth: 400 }}
        />
      </div>

      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
              {['Last Name', 'First Name', 'Badge', 'ND.gov Username', 'Unit', 'Rank', 'Role', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => {
              const rc = roleColor(u.role)
              return (
                <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${COLORS.border}` : 'none', opacity: u.is_active ? 1 : 0.5 }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: COLORS.textDark, fontSize: 13 }}>{u.last_name}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: COLORS.textDark, fontSize: 13 }}>{u.first_name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{u.badge_number || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{u.post_license_number || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{u.unit || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{u.rank || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: rc.bg, color: rc.text, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>{u.role}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: u.is_active ? COLORS.successLight : COLORS.dangerLight, color: u.is_active ? COLORS.success : COLORS.danger, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase' }}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => openEdit(u)} style={{ fontSize: 12, fontWeight: 600, color: COLORS.navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                      <button onClick={() => navigate(`/transcript/${u.id}`)} style={{ fontSize: 12, fontWeight: 600, color: COLORS.gold, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Transcript</button>
                  </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: COLORS.white, borderRadius: 12, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.navy, marginBottom: 20 }}>
              {modal === 'create' ? 'Add New Member' : `Edit — ${editingUser?.first_name} ${editingUser?.last_name}`}
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="First Name" required>
                  <input style={inputStyle} value={form.first_name} onChange={e => set('first_name', e.target.value)} required />
                </Field>
                <Field label="Last Name" required>
                  <input style={inputStyle} value={form.last_name} onChange={e => set('last_name', e.target.value)} required />
                </Field>
                <Field label="Email">
                  <input type="email" style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} />
                </Field>
                <Field label="Badge Number">
                  <input style={inputStyle} value={form.badge_number} onChange={e => set('badge_number', e.target.value)} />
                </Field>
                <Field label="ND.gov Username">
                  <input style={inputStyle} value={form.post_license_number} onChange={e => set('post_license_number', e.target.value)} />
                </Field>
                <Field label="Unit / Assignment">
                  <input style={inputStyle} value={form.unit} onChange={e => set('unit', e.target.value)} />
                </Field>
                <Field label="Rank">
                  <select style={inputStyle} value={form.rank} onChange={e => set('rank', e.target.value)}>
                    {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Portal Role">
                  <select style={inputStyle} value={form.role} onChange={e => set('role', e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                {modal === 'edit' && (
                  <Field label="Status">
                    <select style={inputStyle} value={form.is_active ? 'active' : 'inactive'} onChange={e => set('is_active', e.target.value === 'active')}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </Field>
                )}
              </div>

              {error && (
                <div style={{ background: COLORS.dangerLight, color: COLORS.danger, padding: '10px 14px', borderRadius: 6, fontSize: 13, margin: '12px 0' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setModal(null)} style={{ padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}>
                  {saving ? 'Saving...' : modal === 'create' ? 'Add Member' : 'Save Changes'}
                </button>
              </div>
            </form>
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
