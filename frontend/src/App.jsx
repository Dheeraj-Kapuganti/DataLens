
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ConnectionProvider } from './context/ConnectionContext'
import DashboardLayout from './layouts/DashboardLayout'
import Overview from './pages/Overview'
import QueryLab from './pages/QueryLab'
import IndexAdvisor from './pages/IndexAdvisor'
import Benchmarks from './pages/Benchmarks'
import Connections from './pages/Connections'
import SlowQueryFinder from './pages/SlowQueryFinder'
import Login from './pages/Login'

function ProtectedDashboard() {
  const { user, checkingAuth } = useAuth()
  const location = useLocation()

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111113] text-gray-300">
        Checking your session...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <ConnectionProvider>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/query-lab" element={<QueryLab />} />
          <Route path="/index-advisor" element={<IndexAdvisor />} />
          <Route path="/benchmarks" element={<Benchmarks />} />
          <Route path="/slow-queries" element={<SlowQueryFinder />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DashboardLayout>
    </ConnectionProvider>
  )
}

function AppRoutes() {
  const { user, checkingAuth } = useAuth()

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111113] text-gray-300">
        Checking your session...
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/*" element={<ProtectedDashboard />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
