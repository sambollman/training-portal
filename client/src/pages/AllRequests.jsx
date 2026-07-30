import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

function StatusBadge({ status }) {
  const styles = {
    pending: { bg: '#FFF8E1', text: '#8A6000' },
    approved: { bg: COLORS.successLight, text: COLORS.success },
    denied: { bg: COLORS.dangerLight, text: COLORS.danger },
    enrolled: { bg: '#E0ECF8', text: '#1A5A8A' },
    in_progress: { bg: '#FFF8E1', text: '#8A6000' },
  }
  const s = styles[status] || styles.pending
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4, textTransform: 'uppercase', background: s.bg, color: s.text }}>
      {status === 'in_progress' ? 'In Review' : status}
    </span>
  )
}

export default function AllRequests() {
  const { user } = useAuth()
  const [allRequests, setAllRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  useEffect(() => {
    Promise.all([
      axios.get('/api/requests/all'),
      axios.get('/api/external/all'),
    ]).then(([pr, er]) => {
      const portal = pr.data.requests.map(r => ({ ...r, source: 'portal' }))
      const external = er.data.requests.map(r => ({
        ...r,
        source: 'external',
        title: r.training_name,
        session_date: r.start_date,
        full_name: r.officer_name,
        request_type: 'self_requested',
      }))
      setAllRequests([...portal, ...external].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
    }).finally(() => setLoading(false))
  }, [])

  const filtered = allRequests.filter(r => {
    // Search
    if (search && !r.full_name?.toLowerCase().includes(search.toLowerCase()) &&
        !r.title?.toLowerCase().includes(search.toLowerCase())) return false

    // Status
    if (statusFilter !== 'all' && r.status !== statusFilter && r.chain_status !== statusFilter) return false

    // Type
    if (typeFilter !== 'all' && r.source !== typeFilter) return false

    // Date
    const date = r.session_date ? new Date(r.session_date + 'T12:00:00') : null
    const now = new Date()
    if (dateFilter === 'year' && date && date.getFullYear() !== now.getFullYear()) return false
    if (dateFilter === '30days' && date && (now - date) > 30 * 24 * 60 * 60 * 1000) return false
    if (dateFilter === 'custom') {
      if (customStart && date && date < new Date(customStart + 'T00:00:00')) return false
      if (customEnd && date && date > new Date(customEnd + 'T23:59:59')) return false
    }

    return true
  })

  const inputStyle = {
    padding: '8px 12px', borderRadius: 6, border: `1px solid ${COLORS.border}`,
    fontSize: 13, color: COLORS.textDark, background: COLORS.white,
  }

  if (loading) return <div style={{ padding: 40, color: COLORS.textLight }}>Loading...</div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>All Requests</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>
          {filtered.length} of {allRequests.length} requests
        </p>
      </div>

      {/* Filters */}
      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Search Officer or Training</label>
            <input
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              placeholder="Name or training title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Status</label>
            <select style={{ ...inputStyle, width: '100%' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Review</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Type</label>
            <select style={{ ...inputStyle, width: '100%' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="portal">Portal</option>
              <option value="external">External</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>Date Range</label>
            <select style={{ ...inputStyle, width: '100%' }} value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
              <option value="all">All Time</option>
              <option value="30days">Last 30 Days</option>
              <option value="year">This Year</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
        {dateFilter === 'custom' && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>From</label>
              <input type="date" style={inputStyle} value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, textTransform: 'uppercase' }}>To</label>
              <input type="date" style={inputStyle} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
            <button onClick={() => { setDateFilter('all'); setCustomStart(''); setCustomEnd('') }} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Clear</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: COLORS.bg, borderBottom: `1px solid ${COLORS.border}` }}>
              {['Officer', 'Training', 'Date', 'Type', 'Source', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: COLORS.textLight, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: COLORS.textLight }}>No requests match your filters.</td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={r.id + r.source} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${COLORS.border}` : 'none' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: COLORS.textDark, fontSize: 13 }}>{r.full_name}</div>
                    <div style={{ fontSize: 11, color: COLORS.textLight }}>#{r.badge_number} · {r.unit}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: COLORS.textMid }}>{r.title}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: COLORS.textMid }}>
                    {r.session_date ? new Date(r.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: COLORS.textMid }}>
                    {r.request_type === 'supervisor_enrolled' ? 'Supervisor enrolled' : 'Self-requested'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', background: r.source === 'portal' ? '#E0ECF8' : '#FFF0E0', color: r.source === 'portal' ? '#1A5A8A' : '#B5621B' }}>{r.source === 'portal' ? 'Internal' : 'External'}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge status={r.chain_status === 'in_progress' || r.chain_status === 'returned' ? 'in_progress' : r.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
