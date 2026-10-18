
import { NavLink } from 'react-router'

const navigationItems = [
  { label: 'Overview', path: '/' },
  { label: 'Query Lab', path: '/query-lab' },
  { label: 'Slow Query Finder', path: '/slow-queries' },
  { label: 'Index Advisor', path: '/index-advisor' },
  { label: 'Benchmarks', path: '/benchmarks' },
  { label: 'Database Connections', path: '/connections' },
]

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 flex h-screen w-64 flex-col border-r border-slate-800 bg-[#0B0F14] p-5 text-slate-100">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-lg font-bold text-slate-950">
          D
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">DataLens</h1>
          <p className="text-xs text-slate-400">Query Intelligence</p>
        </div>
      </div>

      <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Workspace
      </p>

      <nav className="flex flex-col gap-2">
        {navigationItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              isActive
                ? 'rounded-lg border border-amber-500/20 bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-400'
                : 'rounded-lg px-4 py-3 text-sm text-slate-400 transition-colors hover:bg-slate-900 hover:text-white'
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-slate-800 bg-[#111820] p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <p className="text-sm font-medium">MongoDB Analyzer</p>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          Understand. Optimize. Measure.
        </p>
      </div>
    </aside>
  )
}

export default Sidebar
