import { useState } from "react";
import api from "../services/api";
import { useConnection } from "../context/ConnectionContext";

const panel = "rounded-lg border border-[#26313D] bg-[#111820]";

const editor =
  "w-full rounded-md border border-[#34404D] bg-[#080C11] p-4 font-mono text-sm leading-6 text-amber-100 outline-none focus:border-amber-500";

const initialFilter = "{\n  \n}";

function Metric({ label, value }) {
  return (
    <div className={`${panel} p-4`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-100">
        {value ?? "—"}
      </p>
    </div>
  );
}

function IndexAdvisor() {
  const { connection, collection, checkingConnection } = useConnection();

  const [filterText, setFilterText] = useState(() => {
    const savedFilter = sessionStorage.getItem("datalens-query-filter");

    if (!savedFilter) return initialFilter;

    try {
      const parsedFilter = JSON.parse(savedFilter);

      if (
        parsedFilter === null ||
        Array.isArray(parsedFilter) ||
        typeof parsedFilter !== "object"
      ) {
        return initialFilter;
      }

      return JSON.stringify(parsedFilter, null, 2);
    } catch {
      return initialFilter;
    } finally {
      sessionStorage.removeItem("datalens-query-filter");
    }
  });

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyzeQuery(event) {
    event.preventDefault();
    setError("");
    setAnalysis(null);

    if (checkingConnection) {
      setError("Checking your database connection. Please try again shortly.");
      return;
    }

    if (!connection) {
      setError(
        "Connect a MongoDB database on the Database Connections page first.",
      );
      return;
    }

    if (!collection) {
      setError("Select a collection on the Database Connections page first.");
      return;
    }

    let filter;

    try {
      filter = JSON.parse(filterText);
    } catch {
      setError("Invalid JSON. Check your brackets, quotes, and commas.");
      return;
    }

    if (!filter || Array.isArray(filter) || typeof filter !== "object") {
      setError("The filter must be a JSON object.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/index-advisor", {
        connectionId: connection.connectionId,
        collection,
        filter,
      });

      setAnalysis(response.data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to analyze this query. Check your database connection and backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  const performance = analysis?.performance;
  const recommendation = analysis?.recommendation;
  const candidates =
    analysis?.availableCandidates ?? analysis?.candidateIndexes ?? [];

  return (
    <div className="space-y-6 p-5 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-amber-500">
          Database optimization
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
          Index Advisor
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Analyze query execution plans, inspect existing indexes, and identify
          candidate indexes for your selected MongoDB collection.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-[#26313D] bg-[#111820] px-3 py-2 text-slate-300">
            Database: {connection?.databaseName || "Not connected"}
          </span>
          <span className="rounded-md border border-[#26313D] bg-[#111820] px-3 py-2 text-slate-300">
            Collection: {collection || "Not selected"}
          </span>
        </div>
      </header>

      <form onSubmit={analyzeQuery} className={`${panel} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              MongoDB filter editor
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Enter a filter for the selected collection. Use actual field names
              and values from your database.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setFilterText(initialFilter);
              setError("");
              setAnalysis(null);
            }}
            className="rounded-md border border-[#34404D] px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
          >
            Clear
          </button>
        </div>

        <textarea
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={8}
          aria-label="MongoDB filter JSON"
          placeholder={'{\n  "status": "pending"\n}'}
          className={`${editor} mt-4 resize-y`}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterText("{}")}
            className="rounded-md border border-[#34404D] px-3 py-2 text-xs text-slate-300 hover:border-amber-500/50"
          >
            Empty filter
          </button>

          <button
            type="button"
            onClick={() =>
              setFilterText(
                '{\n  "$and": [\n    {\n      "status": "pending"\n    },\n    {\n      "priority": { "$gte": 2 }\n    }\n  ]\n}',
              )
            }
            className="rounded-md border border-[#34404D] px-3 py-2 text-xs text-slate-300 hover:border-amber-500/50"
          >
            AND example
          </button>

          <button
            type="button"
            onClick={() =>
              setFilterText(
                '{\n  "$or": [\n    {\n      "status": "pending"\n    },\n    {\n      "status": "processing"\n    }\n  ]\n}',
              )
            }
            className="rounded-md border border-[#34404D] px-3 py-2 text-xs text-slate-300 hover:border-amber-500/50"
          >
            OR example
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          The example filters use placeholder fields. Replace them with fields
          that exist in your selected collection.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#26313D] pt-4">
          <p className="text-xs text-slate-400">
            Read-only analysis · Indexes are never created automatically
          </p>

          <button
            type="submit"
            disabled={loading || checkingConnection}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0B0F14] hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze query"}
          </button>
        </div>
      </form>

      {analysis && performance && recommendation && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="MongoDB execution time"
              value={`${performance.executionTimeMillis ?? 0} ms`}
            />
            <Metric
              label="Documents examined"
              value={Number(
                performance.totalDocsExamined ?? 0,
              ).toLocaleString()}
            />
            <Metric
              label="Index keys examined"
              value={Number(
                performance.totalKeysExamined ?? 0,
              ).toLocaleString()}
            />
            <Metric
              label="Documents returned"
              value={Number(performance.nReturned ?? 0).toLocaleString()}
            />
          </section>

          <section className={`${panel} p-5`}>
            <h2 className="text-sm font-semibold text-slate-100">
              Execution plan assessment
            </h2>
            <p className="mt-2 text-lg font-semibold text-amber-400">
              {performance.assessment || "Assessment unavailable"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {performance.reason || "No assessment details available."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(performance.stages || []).map((stage) => (
                <span
                  key={stage}
                  className="rounded border border-[#34404D] bg-[#0B0F14] px-2.5 py-1.5 font-mono text-xs text-amber-400"
                >
                  {stage}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Scan ratio: {performance.scanRatio ?? "—"}
            </p>
          </section>

          <section className={`${panel} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">
                Index recommendation
              </h2>
              <span className="rounded-md border border-[#34404D] px-2.5 py-1 text-xs text-slate-400">
                {String(recommendation.status || "unknown").replaceAll(
                  "_",
                  " ",
                )}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              {recommendation.message}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Benchmark the candidates below before applying an index.
            </p>
          </section>

          <section className={`${panel} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">
                Candidate indexes
              </h2>
              <span className="text-xs text-slate-400">
                {candidates.length} candidate(s)
              </span>
            </div>

            {candidates.length > 0 ? (
              <div className="mt-4 space-y-3">
                {candidates.map((candidate, index) => (
                  <div
                    key={JSON.stringify(candidate.keys)}
                    className="rounded-lg border border-[#26313D] bg-[#0B0F14] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-slate-100">
                        Candidate {index + 1}
                      </h3>
                      <span className="rounded-md border border-[#34404D] px-2 py-1 text-xs text-slate-400">
                        {candidate.coveredByExistingIndex
                          ? "Covered by existing index"
                          : String(
                              candidate.status || "needs benchmark",
                            ).replaceAll("_", " ")}
                      </span>
                    </div>

                    <pre className="mt-3 overflow-x-auto rounded border border-[#26313D] bg-[#080C11] p-3 text-sm text-amber-300">
                      {JSON.stringify(candidate.keys, null, 2)}
                    </pre>

                    <p className="mt-3 text-sm text-slate-400">
                      {candidate.reason}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                No candidate indexes were returned for this filter.
              </p>
            )}
          </section>

          <section className={`${panel} p-5`}>
            <h2 className="text-sm font-semibold text-slate-100">
              Existing indexes
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#26313D] text-xs text-slate-400">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Index name</th>
                    <th className="py-3 font-medium">Key definition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26313D]">
                  {(analysis.existingIndexes || []).map((index) => (
                    <tr key={index.name}>
                      <td className="py-3 pr-4 text-slate-300">{index.name}</td>
                      <td className="py-3 font-mono text-xs text-slate-400">
                        {JSON.stringify(index.keys)}
                      </td>
                    </tr>
                  ))}
                  {(!analysis.existingIndexes ||
                    analysis.existingIndexes.length === 0) && (
                    <tr>
                      <td colSpan={2} className="py-4 text-sm text-slate-500">
                        No indexes reported.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default IndexAdvisor;
