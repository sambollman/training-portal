import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const COLORS = {
  navy: '#0D1B2A', navyMid: '#1B2E45', navyLight: '#243B55',
  gold: '#C9A84C', silver: '#8A9BB0', white: '#FFFFFF',
  bg: '#F0F3F7', border: '#D1D9E6', textLight: '#6B7F96',
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)
  const isSupervisor = user?.role === 'supervisor' || user?.role === 'coordinator'
  const [returnedCount, setReturnedCount] = useState(0)

  useEffect(() => {
    if (!isSupervisor) return

    const fetchCount = () => {
      Promise.all([
        axios.get('/api/approvals/my-pending'),
        axios.get('/api/external/my-pending'),
      ]).then(([pr, er]) => {
        setPendingCount(pr.data.approvals.length + er.data.approvals.length)
      }).catch(() => {})
    }

    fetchCount()
    window.addEventListener('approval-acted', fetchCount)
    return () => window.removeEventListener('approval-acted', fetchCount)
  }, [isSupervisor])

  useEffect(() => {
    const fetchReturned = () => {
      Promise.all([
        axios.get('/api/requests'),
        axios.get('/api/external/my-requests'),
      ]).then(([pr, er]) => {
        const portalReturned = pr.data.requests.filter(r => r.chain_status === 'returned').length
        const externalReturned = er.data.requests.filter(r => r.chain_status === 'returned').length
        setReturnedCount(portalReturned + externalReturned)
      }).catch(() => {})
    }

    fetchReturned()
    window.addEventListener('approval-acted', fetchReturned)
    return () => window.removeEventListener('approval-acted', fetchReturned)
  }, [])

  const handleLogout = async () => {
    await axios.post('/api/auth/dev-logout')
    logout()
    navigate('/')
  }

  const navStyle = ({ isActive }) => ({
    padding: '10px 20px', fontSize: 13, fontWeight: 600,
    color: isActive ? COLORS.navy : COLORS.textLight,
    borderBottom: isActive ? `2.5px solid ${COLORS.gold}` : '2.5px solid transparent',
    textDecoration: 'none', display: 'inline-block',
    transition: 'all 0.15s',
  })

  
  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: COLORS.navy, borderBottom: `3px solid ${COLORS.gold}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: COLORS.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⭐</div>
            <div>
              <div style={{ color: COLORS.white, fontWeight: 700, fontSize: 17 }}>Training Portal</div>
              <div style={{ color: COLORS.silver, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Officer Development</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: COLORS.white, fontSize: 13, fontWeight: 600 }}>{user?.full_name}</div>
              <div style={{ color: COLORS.silver, fontSize: 11 }}>Badge #{user?.badge_number} · {user?.role}</div>
            </div>
            <button onClick={handleLogout} style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: `1.5px solid ${COLORS.silver}55`,
              background: 'transparent', color: COLORS.silver,
            }}>Sign Out</button>
          </div>
        </div>
      </header>

      <nav style={{ background: COLORS.white, borderBottom: `1px solid ${COLORS.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', borderBottom: isSupervisor ? `1px solid ${COLORS.border}` : 'none' }}>
          <NavLink to="/trainings" style={navStyle}>Available Trainings</NavLink>
          <NavLink to="/calendar" style={navStyle}>Calendar</NavLink>
          <NavLink to="/my-schedule" style={navStyle}>
            My Schedule
            {returnedCount > 0 && (
              <span style={{ marginLeft: 6, background: '#B5621B', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{returnedCount}</span>
            )}
          </NavLink>
          <NavLink to="/transcript" style={navStyle}>Transcript</NavLink>
          <NavLink to="/request-training" style={navStyle}>Request a Training</NavLink>
        </div>
        {isSupervisor && (
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex' }}>
            <NavLink to="/pending" style={navStyle}>
              Pending Approvals
              {pendingCount > 0 && (
                <span style={{ marginLeft: 6, background: '#9B2335', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{pendingCount}</span>
              )}
            </NavLink>
            <NavLink to="/enroll" style={navStyle}>Enroll Officers</NavLink>
            <NavLink to="/all-requests" style={navStyle}>All Requests</NavLink>
            <NavLink to="/compliance" style={navStyle}>Compliance</NavLink>
            {(user?.role === 'coordinator' || user?.role === 'instructor') && (
              <NavLink to="/manage-trainings" style={navStyle}>Manage Trainings</NavLink>
            )}
            {user?.role === 'coordinator' && (
              <>
                <NavLink to="/admin/users" style={navStyle}>User Management</NavLink>
                <NavLink to="/import-training" style={navStyle}>Import Records</NavLink>
              </>
            )}
          </div>
        )}
      </nav>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
        {children}
      </main>
    </div>
  )
}
