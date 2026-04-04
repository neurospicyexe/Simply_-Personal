import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import BottomNav from './components/BottomNav'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const FrontPage = lazy(() => import('./pages/FrontPage'))
const MembersPage = lazy(() => import('./pages/MembersPage'))
const MemberDetailPage = lazy(() => import('./pages/MemberDetailPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const LogsPage = lazy(() => import('./pages/LogsPage'))
const SystemPage = lazy(() => import('./pages/SystemPage'))
const SharePage = lazy(() => import('./pages/SharePage'))
const ShareMemberDetailPage = lazy(() => import('./pages/ShareMemberDetailPage'))

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p role="status" aria-live="polite">Verifying session…</p>
      </div>
    )
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null
  return (
    <>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/front" replace />} />
          <Route path="/front" element={<Protected><FrontPage /></Protected>} />
          <Route path="/members" element={<Protected><MembersPage /></Protected>} />
          <Route path="/members/:id" element={<Protected><MemberDetailPage /></Protected>} />
          <Route path="/system" element={<Protected><SystemPage /></Protected>} />
          <Route path="/logs" element={<Protected><LogsPage /></Protected>} />
          <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
          <Route path="/view/:token" element={<SharePage />} />
          <Route path="/view/:token/members/:memberId" element={<ShareMemberDetailPage />} />
        </Routes>
      </Suspense>
      {isAuthenticated && <BottomNav />}
    </>
  )
}
