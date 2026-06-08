import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

export default function Login() {
  const { login } = useAuth()
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/auth/dev-users')
      .then(res => setUsers(res.data.users))
      .catch(() => setError('Could not load users'))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/dev-login', {
        password,
        userId: selectedUser
      })
      login(res.data.user)
    } catch (err) {
      setError('Invalid password or user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F0F3F7',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 40,
        width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        border: '1px solid #D1D9E6'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⭐</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>
            Training Portal
          </h1>
          <p style={{ color: '#6B7F96', fontSize: 14, marginTop: 6 }}>
            Development Login
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6B7F96', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Login As
            </label>
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #D1D9E6', fontSize: 14, color: '#0D1B2A', background: 'white' }}
            >
              <option value="">Select a user...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6B7F96', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Dev password"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #D1D9E6', fontSize: 14, color: '#0D1B2A', background: 'white', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ background: '#FDECEA', color: '#9B2335', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '11px', borderRadius: 6, border: 'none', background: '#0D1B2A', color: 'white', fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}
          >
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  )
}
