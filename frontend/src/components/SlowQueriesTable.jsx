
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import api from '../services/api'

function getQueryName(record) {
  const filter = record.filter

  if (filter && typeof filter === 'object' && Object.keys(filter).length) {
    return `Find by ${Object.keys(filter).join(', ')}`
  }

  return 'Query on collection'
}

function getStatus(record) {
  const assessment = (
    record.performance?.assessment || ''
  ).toLowerCase()

  if (
    assessment.includes('needs investigation') ||
    assessment.includes('potentially inefficient')
  ) {
    return 'Needs optimization'
  }

  if (
    (record.performance?.stages || []).some(
      (stage) => stage.stage === 'COLLSCAN'
    )
  ) {
    return 'Needs review'
  }

  return 'Recorded'
}

function SlowQueriesTable() {
  const navigate = useNavigate()
  const [queries, setQueries] = useState([])
  const [status, setStatus] = useState('Loading')

  useEffect(() => {
    loadQueries()
  }, [])

  async function loadQueries() {
    try {
      setStatus('Loading')

      const response = await api.get('/query-history')
      const records = Array.isArray(response.data) ? response.data : []

      const sortedQueries = records
        .filter((record) => Number.isFinite(Number(record.latencyMs)))
        .sort(
          (a, b) =>
            Number(b.latencyMs) - Number(a.latencyMs)
        )
        .slice(0, 3)

      setQueries(sortedQueries)
      setStatus(sortedQueries.length ? 'Loaded' : 'Empty')
    } catch {
      setStatus('Error')
    }
  }

  function openQuery(record) {
    if (!record.filter || typeof record.filter !== 'object') {
      return
    }

    sessionStorage.setItem(
      'datalens-query-filter',
      JSON.stringify(record.filter)
    )

    navigate('/query-lab')
  }

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-[#111820]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Slowest Queries
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Highest-latency recorded executions
          </p>
        </div>

        <button
          onClick={() => navigate('/slow-queries')}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-amber-500/50 hover:text-amber-400"
        >
          View all
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="bg-slate-900/50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4 font-medium">Query</th>
              <th className="px-5 py-4 font-medium">Collection</th>
              <th className="px-5 py-4 font-medium">Latency</th>
              <th className="px-5 py-4 font-medium">Status</th>
              <th className="px-5 py-4 font-medium">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800">
            {status === 'Loading' ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  Loading query history...
                </td>
              </tr>
            ) : status === 'Error' ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  Could not load query history.
                  <button
                    onClick={loadQueries}
                    className="ml-2 text-amber-400 hover:text-amber-300"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ) : status === 'Empty' ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  No recorded query executions yet.
                </td>
              </tr>
            ) : (
              queries.map((query) => (
                <tr
                  key={query._id}
                  className="transition-colors hover:bg-slate-900/40"
                >
                  <td className="px-5 py-4 font-medium text-slate-200">
                    <span className="block max-w-56 truncate">
                      {getQueryName(query)}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-slate-400">
                    {query.collectionName || 'Unknown'}
                  </td>

                  <td className="px-5 py-4 font-medium text-amber-400">
                    {Number(query.latencyMs).toLocaleString()} ms
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={
                        getStatus(query) === 'Recorded'
                          ? 'rounded-full bg-slate-500/10 px-2.5 py-1 text-xs text-slate-400'
                          : 'rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400'
                      }
                    >
                      {getStatus(query)}
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <button
                      onClick={() => openQuery(query)}
                      className="text-xs font-medium text-amber-400 hover:text-amber-300"
                    >
                      Investigate
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-800 px-5 py-3">
        <p className="text-xs text-slate-500">
          Showing the three highest-latency executions in the available query history.
        </p>
      </div>
    </div>
  )
}

export default SlowQueriesTable
