
import { useEffect, useState } from "react";
import api from "../services/api";
import MetricCard from "../components/MetricCard";
import PerformanceChart from "../components/PerformanceChart";
import SlowQueriesTable from "../components/SlowQueriesTable";

function Overview() {
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [history, setHistory] = useState([]);
  const [historyStatus, setHistoryStatus] = useState("Loading...");
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    api
      .get("/health")
      .then(() => setBackendStatus("Connected"))
      .catch(() => setBackendStatus("Disconnected"));

    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      setHistoryStatus("Loading...");

      const response = await api.get("/query-history");
      const records = Array.isArray(response.data) ? response.data : [];

      setHistory(records);
      setHistoryStatus("Loaded");
      setLastUpdated(new Date());
    } catch {
      setHistoryStatus("Unavailable");
    }
  }

  const totalQueries = history.length;

  const totalLatency = history.reduce(
    (total, record) => total + (Number(record.latencyMs) || 0),
    0
  );

  const averageLatency =
    totalQueries > 0 ? Math.round(totalLatency / totalQueries) : 0;

  const totalDocumentsExamined = history.reduce(
    (total, record) =>
      total + (Number(record.performance?.totalDocsExamined) || 0),
    0
  );

  const slowQueries = history.filter((record) => {
    const assessment = (
      record.performance?.assessment || ""
    ).toLowerCase();

    return (
      assessment.includes("needs investigation") ||
      assessment.includes("potentially inefficient")
    );
  }).length;

  const indexHitRate = "N/A";

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-slate-800 bg-[#111820] px-4 py-3">
        <span
          className={`h-2 w-2 rounded-full ${
            backendStatus === "Connected"
              ? "bg-emerald-400"
              : backendStatus === "Disconnected"
                ? "bg-red-400"
                : "bg-amber-400"
          }`}
        />
        <span className="text-sm text-slate-300">
          Backend Status: {backendStatus}
        </span>
      </div>

      <div className="mb-8">
        <p className="text-sm font-medium text-amber-500">
          WORKSPACE / OVERVIEW
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Overview
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Monitor your MongoDB query performance and optimization opportunities.
        </p>
      </div>

      {historyStatus === "Unavailable" && (
        <div className="mb-5 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          Could not load query history. Check your backend and try refreshing.
          <button
            onClick={loadHistory}
            className="ml-3 font-medium text-amber-400 hover:text-amber-300"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {historyStatus === "Loading..."
            ? "Loading query statistics..."
            : `Based on ${totalQueries} recorded executions in the available history`}
        </p>

        <button
          onClick={loadHistory}
          disabled={historyStatus === "Loading..."}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-amber-500 hover:text-amber-400 disabled:opacity-50"
        >
          Refresh statistics
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Recorded Executions"
          value={historyStatus === "Loading..." ? "..." : totalQueries.toLocaleString()}
          icon="▤"
          description="Available query history"
        />

        <MetricCard
          title="Avg. Latency"
          value={
            historyStatus === "Loading..."
              ? "..."
              : totalQueries > 0
                ? `${averageLatency} ms`
                : "—"
          }
          icon="◷"
          description="Average recorded execution time"
        />

        <MetricCard
          title="Documents Examined"
          value={
            historyStatus === "Loading..."
              ? "..."
              : totalDocumentsExamined.toLocaleString()
          }
          icon="▤"
          description="Across available recorded executions"
        />

        <MetricCard
          title="Slow Queries"
          value={historyStatus === "Loading..." ? "..." : slowQueries.toLocaleString()}
          icon="⚠"
          description="Flagged by query assessments"
        />
      </div>

      <div className="mt-6">
        <PerformanceChart />
      </div>

      <div className="mt-6">
        <SlowQueriesTable />
      </div>

      {lastUpdated && (
        <p className="mt-4 text-right text-xs text-slate-500">
          Statistics refreshed at {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

export default Overview;
