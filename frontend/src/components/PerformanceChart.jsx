
import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import api from '../services/api'

function PerformanceChart() {
  const [data, setData] = useState([])
  const [status, setStatus] = useState('Loading')

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    try {
      setStatus('Loading')

      const response = await api.get('/query-history')
      const records = Array.isArray(response.data) ? response.data : []

      const validRecords = records
        .filter(
          (record) =>
            record.executedAt &&
            Number.isFinite(Number(record.latencyMs)) &&
            Number(record.latencyMs) >= 0
        )
        .map((record) => ({
          timestamp: new Date(record.executedAt).getTime(),
          latency: Number(record.latencyMs),
        }))
        .filter((record) => Number.isFinite(record.timestamp))

      const hourlyGroups = new Map()

      validRecords.forEach((record) => {
        const hour = new Date(record.timestamp)
        hour.setMinutes(0, 0, 0)

        const key = hour.getTime()

        if (!hourlyGroups.has(key)) {
          hourlyGroups.set(key, {
            timestamp: key,
            totalLatency: 0,
            count: 0,
          })
        }

        const group = hourlyGroups.get(key)
        group.totalLatency += record.latency
        group.count += 1
      })

      const chartData = Array.from(hourlyGroups.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((group) => ({
          timestamp: group.timestamp,
          time: new Date(group.timestamp).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          latency: Math.round(group.totalLatency / group.count),
          executions: group.count,
        }))

      setData(chartData)
      setStatus(chartData.length > 0 ? 'Loaded' : 'Empty')
    } catch {
      setStatus('Error')
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-[#111820] p-5">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Query Performance
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Average recorded query latency by hour
          </p>
        </div>

        <button
          onClick={loadHistory}
          disabled={status === 'Loading'}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-amber-500 hover:text-amber-400 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="h-72 w-full">
        {status === 'Loading' ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Loading performance data...
          </div>
        ) : status === 'Error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-400">
            <p>Could not load query performance data.</p>
            <button
              onClick={loadHistory}
              className="text-amber-400 hover:text-amber-300"
            >
              Try again
            </button>
          </div>
        ) : status === 'Empty' ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No recorded query executions with valid timestamps and latency yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient
                  id="latencyGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="#26313D"
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                stroke="#64748B"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                minTickGap={25}
              />

              <YAxis
                stroke="#64748B"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#94A3B8', fontSize: 12 }}
                unit=" ms"
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: '#111820',
                  border: '1px solid #26313D',
                  borderRadius: '8px',
                  color: '#F1F5F9',
                }}
                formatter={(value, name) => [
                  name === 'latency' ? `${value} ms` : value,
                  name === 'latency' ? 'Average latency' : 'Executions',
                ]}
                labelStyle={{ color: '#CBD5E1' }}
              />

              <Area
                type="monotone"
                dataKey="latency"
                stroke="#F59E0B"
                strokeWidth={2}
                fill="url(#latencyGradient)"
                activeDot={{ r: 5, fill: '#F59E0B' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Based on recorded executions returned by query history. Each point
        represents the average latency for one hour.
      </p>
    </div>
  )
}

export default PerformanceChart
