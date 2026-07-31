import { useState, useEffect } from 'react'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  warning: '#B5621B', warningLight: '#FFF0E0',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

export default function Compliance() {
  const [tags, setTags] = useState([])
  const [selectedTag, setSelectedTag] = useState('')
  const [customTag, setCustomTag] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('not_signed_up')
  const [personnelFilter, setPersonnelFilter] = useState('all')

  useEffect(() => {
    axios.get('/api/compliance/tags')
      .then(res => setTags(res.data.tags))
      .catch(() => {})
  }, [])

  const handleSearch = async () => {
    const tag = customTag || selectedTag
    if (!tag) return
    setLoading(true)
    setData(null)
    try {
      const res = await axios.get(`/api/compliance?tag=${encodeURIComponent(tag)}`)
      setData(res.data)
      setActiveTab('not_signed_up')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 6,
    border: `1px solid ${COLORS.border}`, fontSize: 13,
    color: COLORS.textDark, background: COLORS.white, boxSizing: 'border-box',
  }

  const tabStyle = (tab) => ({
    padding: '10px 20px', fontSize: 13, fontWeight: 600,
    color: activeTab === tab ? COLORS.navy : COLORS.textLight,
    borderBottom: activeTab === tab ? `2.5px solid ${COLORS.gold}` : '2.5px solid transparent',
    background: 'none', border: 'none', borderBottom: activeTab === tab ? `2.5px solid ${COLORS.gold}` : '2.5px solid transparent',
    cursor: 'pointer',
  })

  const UserTable = ({ users, showTraining = false, showStatus = false, emptyMsg }) => (
    users.length === 0 ? (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: COLORS.textLight }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 600 }}>{emptyMsg}</div>
      </div>
    ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Name</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Badge</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rank</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Unit</th>
            {showTraining && <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Session</th>}
            {showStatus && <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u.id + (u.session_date || '')} style={{ borderBottom: i < users.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
              <td style={{ padding: '12px 16px', fontWeight: 600, color: COLORS.textDark, fontSize: 13 }}>{u.full_name}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{u.badge_number || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{u.rank || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{u.unit || '—'}</td>
              {showTraining && <td style={{ padding: '12px 16px', fontSize: 12, color: COLORS.textMid }}>{u.training_title}{u.session_date ? ` · ${new Date(u.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</td>}
              {showStatus && <td style={{ padding: '12px 16px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase', background: u.status === 'approved' ? COLORS.successLight : '#FFF8E1', color: u.status === 'approved' ? COLORS.success : '#8A6000' }}>{u.status}</span>
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
    )
  )

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Required Training Compliance</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>Search by compliance tag to see who has signed up, attended, or not yet completed a required training.</p>
      </div>

      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Select Existing Tag</label>
            <select style={inputStyle} value={selectedTag} onChange={e => { setSelectedTag(e.target.value); setCustomTag('') }}>
              <option value="">Choose a tag...</option>
              {tags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Or Type a Tag</label>
            <input style={inputStyle} value={customTag} onChange={e => { setCustomTag(e.target.value); setSelectedTag('') }} placeholder="e.g. Annual Firearms Qual 2026" />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || (!selectedTag && !customTag)}
            style={{ padding: '9px 20px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: COLORS.navy, color: COLORS.white }}
          >{loading ? 'Loading...' : 'Search'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        {[
          { label: 'All Personnel', value: 'all' },
          { label: 'Sworn', value: 'sworn' },
          { label: 'Civilian', value: 'civilian' },
        ].map(({ label, value }) => (
          <button key={value} onClick={() => setPersonnelFilter(value)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${personnelFilter === value ? COLORS.navy : COLORS.border}`, background: personnelFilter === value ? COLORS.navy : COLORS.white, color: personnelFilter === value ? COLORS.white : COLORS.textMid }}>
            {label}
          </button>
        ))}
      </div>

      {data && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Not Signed Up', value: data.not_signed_up.length, color: COLORS.danger, bg: COLORS.dangerLight, tab: 'not_signed_up' },
              { label: 'Signed Up', value: data.signed_up.length, color: COLORS.warning, bg: COLORS.warningLight, tab: 'signed_up' },
              { label: 'Attended', value: data.attended.length, color: COLORS.success, bg: COLORS.successLight, tab: 'attended' },
            ].map(({ label, value, color, bg, tab }) => (
              <div key={tab} onClick={() => setActiveTab(tab)} style={{ background: bg, borderRadius: 10, padding: '20px 24px', textAlign: 'center', cursor: 'pointer', border: `2px solid ${activeTab === tab ? color : 'transparent'}` }}>
                <div style={{ fontSize: 36, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 13, color, fontWeight: 600, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ borderBottom: `1px solid ${COLORS.border}`, display: 'flex' }}>
              <button style={tabStyle('not_signed_up')} onClick={() => setActiveTab('not_signed_up')}>Not Signed Up ({data.not_signed_up.length})</button>
              <button style={tabStyle('signed_up')} onClick={() => setActiveTab('signed_up')}>Signed Up ({data.signed_up.length})</button>
              <button style={tabStyle('attended')} onClick={() => setActiveTab('attended')}>Attended ({data.attended.length})</button>
            </div>
            <div>
              {activeTab === 'not_signed_up' && <UserTable users={data.not_signed_up} emptyMsg="Everyone has signed up!" />}
              {activeTab === 'signed_up' && <UserTable users={data.signed_up} showTraining showStatus emptyMsg="No one is pending." />}
              {activeTab === 'attended' && <UserTable users={data.attended} showTraining emptyMsg="No one has attended yet." />}
            </div>
          </div>

          {data.trainings.length > 0 && (
            <div style={{ marginTop: 16, background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Sessions Under This Tag</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.trainings.map(t => (
                  <div key={t.id} style={{ background: COLORS.bg, borderRadius: 6, padding: '6px 12px', fontSize: 12, color: COLORS.textMid }}>
                    {t.title} {t.session_date ? `· ${new Date(t.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
