
import { useEffect, useState } from "react";
import api from "../services/api";
import { useConnection } from "../context/ConnectionContext";

const panel = "rounded-lg border border-[#26313D] bg-[#111820]";

const editorClass =
  "w-full rounded-md border border-[#34404D] bg-[#080C11] p-4 font-mono text-sm leading-6 text-amber-100 outline-none focus:border-amber-500";

const initialFilter = "{\n  \n}";

function Metric({ label, value }) {
  return (
    <div className={`${panel} p-4`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-slate-100">
        {value}
      </p>
    </div>
  );
}

function getNestedValue(document, path) {
  return path.split(".").reduce((value, key) => value?.[key], document);
}

function formatValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function QueryLab() {
  const { connection, collection } = useConnection();

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

  const [schema, setSchema] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState("");
  const [limit, setLimit] = useState("10");
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function discoverSchema() {
      setSchemaLoading(true);
      setSchemaError("");
      setSchema([]);
      setResults([]);
      setPagination(null);
      setPerformance(null);
      setPage(1);
      setError("");

      if (connection && !collection) {
        setSchemaError("Select a collection on the Database Connections page.");
        setSchemaLoading(false);
        return;
      }

      try {
        const payload = {};

        if (connection) {
          payload.connectionId = connection.connectionId;
          payload.collection = collection;
        }

        const response = await api.post("/schema", payload);

        if (active) {
          setSchema(response.data.fields || []);
        }
      } catch (err) {
        if (active) {
          setSchemaError(
            err.response?.data?.message ||
              "Unable to discover the collection schema.",
          );
        }
      } finally {
        if (active) setSchemaLoading(false);
      }
    }

    discoverSchema();

    return () => {
      active = false;
    };
  }, [connection, collection]);

  const columns = schema.length
    ? schema.slice(0, 8).map((field) => field.name)
    : results.length
      ? Object.keys(results[0]).slice(0, 8)
      : [];

  async function runQuery(nextPage = 1, nextLimit = limit) {
    setError("");

    let parsedFilter;

    try {
      parsedFilter = JSON.parse(filterText);
    } catch {
      setError("Invalid JSON. Check your brackets, quotes, and commas.");
      return;
    }

    if (
      parsedFilter === null ||
      Array.isArray(parsedFilter) ||
      typeof parsedFilter !== "object"
    ) {
      setError("The filter must be a JSON object.");
      return;
    }

    if (connection && !collection) {
      setError("Select a collection on the Database Connections page.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        filter: parsedFilter,
        page: nextPage,
        limit: Number(nextLimit),
      };

      if (connection) {
        payload.connectionId = connection.connectionId;
        payload.collection = collection;
      }

      const response = await api.post("/query", payload);

      setResults(response.data.results || []);
      setPagination(response.data.pagination);
      setPerformance(response.data.performance);
      setPage(nextPage);
      setLimit(String(nextLimit));
    } catch (err) {
      setError(err.response?.data?.message || "Unable to execute query.");
      setResults([]);
      setPagination(null);
      setPerformance(null);
    } finally {
      setLoading(false);
    }
  }

  function applyFilter(event) {
    event.preventDefault();
    runQuery(1, limit);
  }

  function loadExample(example) {
    setFilterText(JSON.stringify(example, null, 2));
    setError("");
  }

  const firstRow = pagination?.totalDocuments
    ? (page - 1) * Number(limit) + 1
    : 0;

  const lastRow = pagination
    ? Math.min(page * Number(limit), pagination.totalDocuments)
    : 0;

  return (
    <div className="space-y-6 p-5 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-amber-400">
          Database performance
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
          Query Lab
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Write MongoDB filters and inspect query execution performance.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-[#26313D] bg-[#111820] px-3 py-2 text-slate-300">
            Database: {connection?.databaseName || "DataLens sample database"}
          </span>
          <span className="rounded-md border border-[#26313D] bg-[#111820] px-3 py-2 text-slate-300">
            Collection: {connection ? collection || "Not selected" : "students"}
          </span>
          <span className="rounded-md border border-[#26313D] bg-[#111820] px-3 py-2 text-slate-300">
            {schemaLoading
              ? "Discovering schema..."
              : `${schema.length} fields discovered`}
          </span>
        </div>
      </header>

      <form onSubmit={applyFilter} className={`${panel} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#26313D] pb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              MongoDB filter editor
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Enter a MongoDB filter document in JSON format.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setFilterText(initialFilter);
              setError("");
            }}
            className="rounded-md border border-[#34404D] px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
          >
            Clear
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadExample({})}
            className="rounded-md border border-[#34404D] px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/50"
          >
            Empty filter
          </button>
          <button
            type="button"
            onClick={() =>
              loadExample({
                $and: [{ city: "Bangalore" }, { cgpa: { $gt: 8 } }],
              })
            }
            className="rounded-md border border-[#34404D] px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/50"
          >
            AND example
          </button>
          <button
            type="button"
            onClick={() =>
              loadExample({
                $or: [{ city: "Bangalore" }, { city: "Hyderabad" }],
              })
            }
            className="rounded-md border border-[#34404D] px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/50"
          >
            OR example
          </button>
        </div>

        <textarea
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={10}
          aria-label="MongoDB filter JSON"
          placeholder={'{\n  "city": "Bangalore",\n  "cgpa": { "$gt": 8 }\n}'}
          className={`${editorClass} mt-3 resize-y`}
        />

        <div className="mt-4 rounded-md border border-[#26313D] bg-[#0D131A] p-3">
          <p className="text-xs font-medium text-slate-300">
            Discovered fields
          </p>

          {schemaLoading ? (
            <p className="mt-2 text-xs text-slate-500">
              Loading collection schema...
            </p>
          ) : schema.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {schema.map((field) => (
                <button
                  key={field.name}
                  type="button"
                  title={`Type: ${field.type}`}
                  onClick={() => {
                    setFilterText((current) => {
                      try {
                        const parsed = JSON.parse(current);

                        if (
                          !parsed ||
                          Array.isArray(parsed) ||
                          typeof parsed !== "object"
                        ) {
                          return JSON.stringify({ [field.name]: "" }, null, 2);
                        }

                        return JSON.stringify(
                          { ...parsed, [field.name]: "" },
                          null,
                          2,
                        );
                      } catch {
                        return JSON.stringify({ [field.name]: "" }, null, 2);
                      }
                    });
                    setError("");
                  }}
                  className="rounded border border-[#34404D] px-2 py-1 text-xs text-slate-300 hover:border-amber-500/60 hover:text-amber-300"
                >
                  {field.name}
                  <span className="ml-1 text-slate-500">{field.type}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              {schemaError || "No fields discovered yet."}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#26313D] pt-4">
          <div>
            <p className="text-xs text-slate-400">
              Read-only filter · Maximum 100 rows per page
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Use JSON values. BSON-specific values such as ObjectId need
              explicit support.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400">
              Rows
              <select
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                className="ml-2 rounded-md border border-[#34404D] bg-[#0B0F14] px-2 py-2 text-slate-200 outline-none focus:border-amber-500"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={loading || schemaLoading}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Executing..." : "Run query"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
      </form>

      {performance && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Wall-clock latency" value={`${performance.latencyMs} ms`} />
            <Metric
              label="Documents examined"
              value={Number(performance.totalDocsExamined || 0).toLocaleString()}
            />
            <Metric
              label="Index keys examined"
              value={Number(performance.totalKeysExamined || 0).toLocaleString()}
            />
            <Metric
              label="Documents returned"
              value={Number(performance.nReturned || 0).toLocaleString()}
            />
          </section>

          <section className={`${panel} space-y-4 p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400">Performance assessment</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">
                  {performance.assessment || "Assessment unavailable"}
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">
                  {performance.reason || "No assessment details available."}
                </p>
              </div>

              <div className="rounded-md border border-[#34404D] bg-[#0D131A] px-3 py-2">
                <p className="text-xs text-slate-400">Scan ratio</p>
                <p className="mt-1 text-lg font-semibold text-amber-300">
                  {performance.scanRatio ?? "—"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-[#26313D] pt-4">
              <div>
                <p className="text-xs text-slate-400">Execution plan stages</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(performance.stages || []).map((stage) => (
                    <span
                      key={stage}
                      className="rounded border border-[#34404D] px-2 py-1 font-mono text-xs text-slate-300"
                    >
                      {stage}
                    </span>
                  ))}
                  {(!performance.stages || performance.stages.length === 0) && (
                    <span className="text-xs text-slate-500">
                      No stages reported
                    </span>
                  )}
                </div>
              </div>

              <div className="ml-auto">
                <p className="text-xs text-slate-400">MongoDB execution time</p>
                <p className="mt-1 text-sm font-medium text-slate-200">
                  {performance.executionTimeMillis ?? 0} ms
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26313D] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Query results
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {pagination
                ? `${pagination.totalDocuments.toLocaleString()} matching documents`
                : "Run a query to view documents"}
            </p>
          </div>

          {pagination && (
            <span className="text-xs text-slate-400">
              Page {page} of {pagination.totalPages}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-[#26313D] bg-[#0D131A] text-xs text-slate-400">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-4 py-3 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-[#26313D]">
              {results.map((document, index) => (
                <tr
                  key={String(document._id ?? index)}
                  className="hover:bg-white/[0.02]"
                >
                  {columns.map((column) => (
                    <td
                      key={column}
                      className="max-w-xs break-words px-4 py-3 text-slate-300"
                    >
                      {formatValue(getNestedValue(document, column))}
                    </td>
                  ))}
                </tr>
              ))}

              {loading && (
                <tr>
                  <td
                    colSpan={Math.max(columns.length, 1)}
                    className="px-4 py-10 text-center text-sm text-slate-400"
                  >
                    Executing query...
                  </td>
                </tr>
              )}

              {!loading && pagination && results.length === 0 && (
                <tr>
                  <td
                    colSpan={Math.max(columns.length, 1)}
                    className="px-4 py-10 text-center text-sm text-slate-400"
                  >
                    No matching documents found.
                  </td>
                </tr>
              )}

              {!loading && !pagination && (
                <tr>
                  <td
                    colSpan={Math.max(columns.length, 1)}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Enter a filter and run a query to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#26313D] px-5 py-4">
            <p className="text-xs text-slate-400">
              Showing {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of{" "}
              {pagination.totalDocuments.toLocaleString()}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => runQuery(page - 1)}
                className="rounded-md border border-[#34404D] px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="min-w-16 text-center text-xs tabular-nums text-slate-400">
                {page} / {pagination.totalPages}
              </span>

              <button
                type="button"
                disabled={loading || page >= pagination.totalPages}
                onClick={() => runQuery(page + 1)}
                className="rounded-md border border-[#34404D] px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default QueryLab;
