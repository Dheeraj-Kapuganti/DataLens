
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import api from '../services/api'

function getQueryLabel(record) {
  const fields = Object.keys(record.filter || {})

  if (fields.length === 0) {
    return `Query on ${record.collectionName}`
  }

  return `Find by ${fields.join(', ')}`
}

function getQueryStatus(record) {
  const assessment = record.performance?.assessment?.toLowerCase() || ''
  const stages = record.performance?.stages || []

  if (assessment.includes('needs investigation')) {
    return 'Slow'
  }

  if (assessment.includes('potentially inefficient')) {
    return 'Needs review'
  }

  if (stages.includes('COLLSCAN')) {
    return 'Needs review'
  }

  if (assessment) {
    return 'Healthy'
  }

  return 'Needs review'
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString()
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString()
}

function MetricCard({ label, value, detail, icon }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-[#111820] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-400">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-lg text-amber-400">
          {icon}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    Slow: 'border-red-500/20 bg-red-500/10 text-red-400',
    'Needs review': 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    Healthy: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  }

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[status] || styles['Needs review']
      }`}
    >
      {status}
    </span>
  )
}

function SlowQueryFinder() {
  const navigate = useNavigate()

  const [queries, setQueries] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedQuery, setSelectedQuery] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadHistory() {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/query-history')
      const records = Array.isArray(response.data) ? response.data : []

      const formattedRecords = records.map((record) => ({
        ...record,
        id: String(record._id),
        query: getQueryLabel(record),
        collection: record.collectionName || 'Unknown collection',
        duration: record.latencyMs ?? 0,
        docsExamined: record.performance?.totalDocsExamined ?? 0,
        docsReturned: record.performance?.nReturned ?? 0,
        status: getQueryStatus(record),
      }))

      setQueries(formattedRecords)

      setSelectedQuery((current) => {
        if (!current) return null

        return (
          formattedRecords.find((record) => record.id === current.id) || null
        )
      })
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to load query history. Check that the backend is running.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const filteredQueries = queries.filter((query) => {
    const searchableText = [
      query.query,
      query.collection,
      query.databaseName,
      query.status,
      JSON.stringify(query.filter),
    ]
      .join(' ')
      .toLowerCase()

    const matchesSearch = searchableText.includes(search.toLowerCase())
    const matchesStatus =
      statusFilter === 'All' || query.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const slowCount = queries.filter(
    (query) => query.status === 'Slow',
  ).length

  const averageDuration = queries.length
    ? Math.round(
        queries.reduce((total, query) => total + query.duration, 0) /
          queries.length,
      )
    : 0

  function investigateQuery() {
    if (!selectedQuery) return

    sessionStorage.setItem(
      'datalens-query-filter',
      JSON.stringify(selectedQuery.filter || {}),
    )

    navigate('/query-lab')
  }

  function checkIndexRecommendation() {
    if (!selectedQuery) return

    sessionStorage.setItem(
      'datalens-query-filter',
      JSON.stringify(selectedQuery.filter || {}),
    )

    navigate('/index-advisor')
  }

  return (
    <div className="min-h-full min-w-0 space-y-6 p-5 text-slate-100 sm:space-y-8 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Performance monitoring
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Slow Query Finder
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review recorded query executions, inspect their performance, and
            investigate potentially inefficient queries.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={loading}
          className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200 transition-colors hover:border-amber-500/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>↻</span>
          {loading ? 'Refreshing...' : 'Refresh history'}
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"
        >
          {error}
          <button
            type="button"
            onClick={loadHistory}
            className="ml-3 underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          label="Recorded executions"
          value={formatNumber(queries.length)}
          detail="Saved query history records"
          icon="⌕"
        />
        <MetricCard
          label="Slow queries"
          value={formatNumber(slowCount)}
          detail="Based on recorded plan assessments"
          icon="!"
        />
        <MetricCard
          label="Average duration"
          value={`${averageDuration} ms`}
          detail="Across recorded executions"
          icon="◷"
        />
        <MetricCard
          label="Documents examined"
          value={formatNumber(
            queries.reduce((total, query) => total + query.docsExamined, 0),
          )}
          detail="Across the displayed history"
          icon="↻"
        />
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-[#111820]">
        <div className="flex flex-col gap-4 border-b border-slate-800 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">
              Query activity
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Select a recorded execution to inspect its details.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search queries..."
              aria-label="Search queries"
              className="min-w-0 rounded-lg border border-slate-700 bg-[#0B0F14] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500 sm:w-56"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
              className="rounded-lg border border-slate-700 bg-[#0B0F14] px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-amber-500"
            >
              <option value="All">All statuses</option>
              <option value="Slow">Slow</option>
              <option value="Needs review">Needs review</option>
              <option value="Healthy">Healthy</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#0D131A] text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-4 font-medium">Query</th>
                <th className="px-5 py-4 font-medium">Duration</th>
                <th className="px-5 py-4 font-medium">Docs examined</th>
                <th className="px-5 py-4 font-medium">Docs returned</th>
                <th className="px-5 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredQueries.map((query) => {
                const selected = selectedQuery?.id === query.id

                return (
                  <tr
                    key={query.id}
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={() => setSelectedQuery(query)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedQuery(query)
                      }
                    }}
                    className={`cursor-pointer border-t border-slate-800/80 transition-colors hover:bg-slate-800/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber-500 ${
                      selected ? 'bg-amber-500/[0.07]' : ''
                    }`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            query.status === 'Slow'
                              ? 'bg-red-400'
                              : query.status === 'Healthy'
                                ? 'bg-emerald-400'
                                : 'bg-amber-400'
                          }`}
                        />
                        <div>
                          <p className="whitespace-nowrap font-medium text-slate-100">
                            {query.query}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {query.databaseName}.{query.collection}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {formatDate(query.executedAt)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-medium tabular-nums text-slate-200">
                      {query.duration} ms
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-slate-300">
                      {formatNumber(query.docsExamined)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-slate-300">
                      {formatNumber(query.docsReturned)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={query.status} />
                    </td>
                  </tr>
                )
              })}

              {!loading && filteredQueries.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-slate-500"
                  >
                    {queries.length === 0
                      ? 'No query history yet. Run a query in Query Lab first.'
                      : 'No queries match your search or status filter.'}
                  </td>
                </tr>
              )}

              {loading && queries.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-slate-400"
                  >
                    Loading query history...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-1 border-t border-slate-800 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {filteredQueries.length} of {queries.length} recorded
            executions
          </span>
          <span>History is loaded from your DataLens database</span>
        </div>
      </section>

      {selectedQuery && (
        <section className="min-w-0 overflow-hidden rounded-xl border border-amber-500/20 bg-[#111820]">
          <div className="flex flex-col gap-4 border-b border-slate-800 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-amber-400">
                Recorded execution details
              </p>
              <h2 className="mt-2 break-words text-lg font-semibold text-white sm:text-xl">
                {selectedQuery.query}
              </h2>
              <p className="mt-1 break-words text-sm text-slate-400">
                Database: {selectedQuery.databaseName} · Collection:{' '}
                {selectedQuery.collection}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Executed at: {formatDate(selectedQuery.executedAt)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={investigateQuery}
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
              >
                Investigate in Query Lab →
              </button>

              <button
                onClick={checkIndexRecommendation}
                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-amber-500/50 hover:text-amber-300"
              >
                Check index recommendation
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <div className="rounded-lg border border-slate-800 bg-[#0B0F14] p-4">
              <p className="text-xs text-slate-500">Measured duration</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-white">
                {selectedQuery.duration} ms
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#0B0F14] p-4">
              <p className="text-xs text-slate-500">Documents examined</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-white">
                {formatNumber(selectedQuery.docsExamined)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#0B0F14] p-4">
              <p className="text-xs text-slate-500">Documents returned</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-white">
                {formatNumber(selectedQuery.docsReturned)}
              </p>
            </div>
          </div>

          <div className="space-y-4 px-4 pb-5 sm:px-5">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-300">
                Recorded filter
              </p>
              <pre className="max-w-full overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0F14] p-4 text-xs leading-6 text-amber-300 sm:text-sm">
                {JSON.stringify(selectedQuery.filter || {}, null, 2)}
              </pre>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-300">
                Execution plan assessment
              </p>
              <div className="rounded-lg border border-slate-800 bg-[#0B0F14] p-4">
                <p className="text-sm text-slate-200">
                  {selectedQuery.performance?.assessment ||
                    'Assessment unavailable'}
                </p>
                {selectedQuery.performance?.reason && (
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {selectedQuery.performance.reason}
                  </p>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Scan ratio: {selectedQuery.performance?.scanRatio ?? '—'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedQuery.performance?.stages || []).map((stage) => (
                    <span
                      key={stage}
                      className="rounded border border-slate-700 bg-[#111820] px-2.5 py-1.5 font-mono text-xs text-amber-300"
                    >
                      {stage}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default SlowQueryFinder
