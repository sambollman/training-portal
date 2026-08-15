import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', gold: '#C9A84C', bg: '#F0F3F7', white: '#FFFFFF',
  success: '#2D6A4F', successLight: '#D8F3DC',
  danger: '#9B2335', dangerLight: '#FDECEA',
  warning: '#B5621B', warningLight: '#FFF0E0',
  border: '#D1D9E6', textDark: '#0D1B2A', textLight: '#6B7F96', textMid: '#3D5166',
}

export default function ImportTraining() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { setError('Please select a file'); return }
    setError('')
    setImporting(true)
    setResults(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post('/api/import/training-records', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResults(res.data.results)
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.navy, margin: 0 }}>Import Training Records</h1>
        <p style={{ color: COLORS.textLight, fontSize: 13, marginTop: 4 }}>
          Upload an Excel file to bulk import historical training records. Cancelled trainings and pending records will be skipped automatically.
        </p>
      </div>

      <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Expected Columns</div>
        <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            'Employee', 'Course', 'Date Time Starts', 'Date Time Ends',
            'Cost', 'Extra Costs', 'Course Hours', 'Certification Hours', 'Outcome'
          ].map(col => (
            <div key={col} style={{ fontSize: 12, color: COLORS.textMid, background: COLORS.bg, padding: '6px 10px', borderRadius: 4 }}>
              {col}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: COLORS.textLight, background: COLORS.warningLight, padding: '10px 14px', borderRadius: 6, border: `1px solid ${COLORS.warning}44` }}>
          ⚠️ Make sure all employees in the file have been added to User Management first. Unmatched names will be skipped and listed in the results.
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 24, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>Select File</div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={e => setFile(e.target.files[0])}
            style={{ fontSize: 13, color: COLORS.textMid, display: 'block', width: '100%', padding: '8px', borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.white, cursor: 'pointer', boxSizing: 'border-box' }}
          />
          {file && <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 8 }}>Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</div>}
        </div>

        {error && (
          <div style={{ background: COLORS.dangerLight, color: COLORS.danger, padding: '12px 16px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginBottom: 24 }}>
          <button type="button" onClick={() => navigate(-1)} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${COLORS.border}`, background: COLORS.white, color: COLORS.textMid }}>Cancel</button>
          <button type="submit" disabled={importing || !file} style={{ padding: '10px 24px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: importing || !file ? 'default' : 'pointer', border: 'none', background: !file ? COLORS.border : COLORS.navy, color: !file ? COLORS.textLight : COLORS.white }}>
            {importing ? 'Importing...' : 'Import Records'}
          </button>
        </div>
      </form>

      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Imported', value: results.imported, color: COLORS.success, bg: COLORS.successLight },
              { label: 'Skipped (Cancelled)', value: results.skipped_cancelled, color: COLORS.textMid, bg: COLORS.bg },
              { label: 'Skipped (Pending)', value: results.skipped_pending, color: COLORS.textMid, bg: COLORS.bg },
              { label: 'Skipped (Duplicate)', value: results.skipped_duplicate, color: COLORS.textMid, bg: COLORS.bg },
              { label: 'No User Match', value: results.skipped_no_match.length, color: results.skipped_no_match.length > 0 ? COLORS.warning : COLORS.textMid, bg: results.skipped_no_match.length > 0 ? COLORS.warningLight : COLORS.bg },
            ].map(({ label, value, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          {results.skipped_no_match.length > 0 && (
            <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.warning, marginBottom: 12 }}>⚠️ The following names had no matching user in the system:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {results.skipped_no_match.map(name => (
                  <div key={name} style={{ fontSize: 13, color: COLORS.textMid, padding: '6px 10px', background: COLORS.bg, borderRadius: 4 }}>{name}</div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textLight, marginTop: 12 }}>Add these users in User Management and re-run the import to capture their records.</div>
            </div>
          )}

          {results.errors.length > 0 && (
            <div style={{ background: COLORS.dangerLight, border: `1px solid ${COLORS.danger}44`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.danger, marginBottom: 8 }}>Errors:</div>
              {results.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: COLORS.danger }}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
