
import { useState } from 'react'
import api from '../services/api'
import { useConnection } from '../context/ConnectionContext'

export default function Connections() {
  const [connectionString, setConnectionString] = useState('')
  const [databaseName, setDatabaseName] = useState('')
  const {
    connection,
    setConnection,
    collection,
    setCollection,
    clearConnection,
  } = useConnection()
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleConnect(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    setCollections([])

    try {
      const response = await api.post('/connections/connect', {
        connectionString,
        databaseName,
      })

      const connectedDatabase = response.data
      setConnection(connectedDatabase)
      console.log('Connected database:', connectedDatabase)
      setConnectionString('')

      const collectionsResponse = await api.get(
        `/connections/${connectedDatabase.connectionId}/collections`
      )

      const availableCollections = collectionsResponse.data.collections

      setCollections(availableCollections)
      setCollection(availableCollections[0] ?? '')
      setMessage('Database connected successfully.')
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to connect to the database.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    if (!connection) return

    setDisconnecting(true)
    setError('')
    setMessage('')

    try {
      await api.delete(`/connections/${connection.connectionId}`)

      clearConnection()
      setCollections([])
      setDatabaseName('')
      setMessage('Database disconnected successfully.')
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Unable to disconnect the database.'
      )
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="min-h-full space-y-8 p-6 lg:p-8">
      <div>
        <p className="text-sm font-medium text-amber-400">
          DATABASE MANAGEMENT
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-100">
          Database Connections
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Connect a MongoDB Atlas database to analyze its query performance.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="rounded-xl border border-[#26313D] bg-[#111820] p-6 xl:col-span-3">
          <h2 className="text-lg font-semibold text-slate-100">
            Connect MongoDB Atlas
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Enter your Atlas connection URI and the database name.
          </p>

          <form onSubmit={handleConnect} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="connectionString"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                MongoDB connection URI
              </label>
              <input
                id="connectionString"
                type="password"
                autoComplete="off"
                required
                value={connectionString}
                onChange={(event) => setConnectionString(event.target.value)}
                placeholder="mongodb+srv://..."
                disabled={loading || Boolean(connection)}
                className="w-full rounded-lg border border-[#26313D] bg-[#0B0F14] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-400 disabled:opacity-50"
              />
              <p className="mt-2 text-xs text-slate-500">
                Your URI is sent to the DataLens backend. Never share it publicly.
              </p>
            </div>

            <div>
              <label
                htmlFor="databaseName"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Database name
              </label>
              <input
                id="databaseName"
                required
                value={databaseName}
                onChange={(event) => setDatabaseName(event.target.value)}
                placeholder="myDatabase"
                disabled={loading || Boolean(connection)}
                className="w-full rounded-lg border border-[#26313D] bg-[#0B0F14] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-400 disabled:opacity-50"
              />
            </div>

            {!connection ? (
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-[#0B0F14] transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Connecting...' : 'Connect Database'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-lg border border-red-500/40 px-5 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            )}
          </form>
        </section>

        <section className="rounded-xl border border-[#26313D] bg-[#111820] p-6 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-100">
              Connection Status
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                connection
                  ? 'bg-emerald-400/10 text-emerald-400'
                  : 'bg-slate-700/40 text-slate-400'
              }`}
            >
              {connection ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {connection ? (
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500">Database</p>
                <p className="mt-1 break-all text-sm text-slate-200">
                  {connection.databaseName}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Collections found</p>
                <p className="mt-1 text-2xl font-semibold text-amber-400">
                  {collections.length}
                </p>
              </div>

              <div>
                <label
                  htmlFor="collection"
                  className="text-xs text-slate-500"
                >
                  Select collection for analysis
                </label>

                {collections.length > 0 ? (
                  <select
                    id="collection"
                    value={collection}
                    onChange={(event) => setCollection(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-[#26313D] bg-[#0B0F14] px-3 py-3 text-sm text-slate-200 outline-none focus:border-amber-400"
                  >
                    {collections.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No collections found in this database.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-lg border border-dashed border-[#26313D] p-6 text-center">
              <p className="text-sm text-slate-300">
                No active database connection
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Connect a database to view its collections here.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
        <p className="text-sm font-medium text-amber-300">
          Development security note
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Active connections are held in backend memory and disappear when the
          backend restarts. This prototype does not yet implement user
          authentication or connection ownership. Do not expose it publicly with
          real database credentials.
        </p>
      </div>
    </div>
  )
}
