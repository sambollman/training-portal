import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Trainings from './pages/Trainings'
import MySchedule from './pages/MySchedule'
import Pending from './pages/Pending'
import Enroll from './pages/Enroll'
import AllRequests from './pages/AllRequests'
import Layout from './components/Layout'
import ManageTrainings from './pages/ManageTrainings'
import CreateTraining from './pages/CreateTraining'
import EditTraining from './pages/EditTraining'
import TrainingDetail from './pages/TrainingDetail'
import AdminUsers from './pages/AdminUsers'
import RequestTraining from './pages/RequestTraining'
import Transcript from './pages/Transcript'
import Calendar from './pages/Calendar'
import ImportTraining from './pages/ImportTraining'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/trainings" />} />
        <Route path="/trainings" element={<Trainings />} />
        <Route path="/my-schedule" element={<MySchedule />} />
        <Route path="/trainings/:id" element={<TrainingDetail />} />
        <Route path="/request-training" element={<RequestTraining />} />
        <Route path="/transcript" element={<Transcript />} />
        <Route path="/transcript/:officerId" element={<Transcript />} />
        <Route path="/calendar" element={<Calendar />} />  
        {(user.role === 'supervisor' || user.role === 'coordinator') && (
  <>
    <Route path="/pending" element={<Pending />} />
    <Route path="/enroll" element={<Enroll />} />
    <Route path="/all-requests" element={<AllRequests />} />
  </>
)}
{user.role === 'coordinator' && (
  <>
    <Route path="/manage-trainings" element={<ManageTrainings />} />
    <Route path="/create-training" element={<CreateTraining />} />
    <Route path="/edit-training/:id" element={<EditTraining />} />
    <Route path="/admin/users" element={<AdminUsers />} />
    <Route path="/import-training" element={<ImportTraining />} />
  </>
)}
        <Route path="*" element={<Navigate to="/trainings" />} />
      </Routes>
    </Layout>
  )
}
