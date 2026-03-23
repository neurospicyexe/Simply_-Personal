import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import FrontPage from './pages/FrontPage'
import MembersPage from './pages/MembersPage'
import MemberDetailPage from './pages/MemberDetailPage'
import SettingsPage from './pages/SettingsPage'
import LogsPage from './pages/LogsPage'
import SystemPage from './pages/SystemPage'
import BottomNav from './components/BottomNav'

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { isAuthenticated } = useAuth()
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/front" replace />} />
        <Route path="/front" element={<Protected><FrontPage /></Protected>} />
        <Route path="/members" element={<Protected><MembersPage /></Protected>} />
        <Route path="/members/:id" element={<Protected><MemberDetailPage /></Protected>} />
        <Route path="/system" element={<Protected><SystemPage /></Protected>} />
        <Route path="/logs" element={<Protected><LogsPage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      </Routes>
      {isAuthenticated && <BottomNav />}
    </>
  )
}
