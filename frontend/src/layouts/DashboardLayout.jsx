
import { useNavigate } from 'react-router'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'

function DashboardLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      console.error('Logout failed')
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[#0B0F14] text-slate-100">
      <Sidebar />

      <main className="ml-64 flex h-screen flex-col overflow-y-auto">
        <header className="flex min-h-16 items-center justify-end gap-4 border-b border-white/10 px-6">
          <div className="min-w-0 text-right">
            <p className="text-xs text-slate-400">Signed in as</p>
            <p className="max-w-64 truncate text-sm text-slate-200">
              {user?.email}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-amber-400 hover:text-amber-300"
          >
            Log out
          </button>
        </header>

        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  )
}

export default DashboardLayout
