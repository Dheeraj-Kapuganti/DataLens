
import { useState } from "react";
import api from "../services/api";
import { useConnection } from "../context/ConnectionContext";

const panel = "rounded-lg border border-[#26313D] bg-[#111820]";
const buttonPrimary =
  "rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0B0F14] transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondary =
  "rounded-md border border-[#34404D] px-4 py-2 text-sm text-slate-200 transition hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50";

function Metric({ label, value, detail }) {
  return (
    <div className={`${panel} min-w-0 p-4`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-slate-100">
        {value ?? "—"}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function formatMs(value) {
  return typeof value === "number" ? `${value.toFixed(2)} ms` : "—";
}

function PerformanceSummary({ title, data }) {
  if (!data) return null;

  const benchmark = data.benchmark;
  const performance = data.performance;

  return (
    <section className={`${panel} p-4`}>
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Metric
          label="Median latency"
          value={formatMs(benchmark?.medianLatencyMs)}
          detail={`${benchmark?.measuredRuns ?? 0} measured runs`}
        />
        <Metric
          label="Documents examined"
          value={Number(performance?.totalDocsExamined ?? 0).toLocaleString()}
        />
        <Metric
          label="Index keys examined"
          value={Number(performance?.totalKeysExamined ?? 0).toLocaleString()}
        />
        <Metric
          label="Results returned"
          value={Number(performance?.nReturned ?? 0).toLocaleString()}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs text-slate-400">Execution plan stages</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(performance?.stages || []).map((stage, index) => (
            <span
              key={`${stage}-${index}`}
              className="rounded border border-[#34404D] bg-[#0B0F14] px-2 py-1 font-mono text-xs text-amber-400"
            >
              {stage}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
  disabled,
}) {
  const tested = candidate.status === "tested";
  const improvement = candidate.latencyChangePercent;

  return (
    <article
      className={`${panel} p-4 ${
        selected ? "border-amber-500" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400">
            {candidate.rank ? `Performance rank #${candidate.rank}` : "Candidate"}
          </p>
          <p className="mt-2 break-all font-mono text-sm text-amber-300">
            {JSON.stringify(candidate.keys)}
          </p>
        </div>

        <span
          className={`rounded-md border px-2 py-1 text-xs ${
            tested
              ? "border-emerald-900 bg-emerald-950/30 text-emerald-300"
              : candidate.status === "already_covered"
                ? "border-slate-700 text-slate-400"
                : "border-red-900 text-red-300"
          }`}
        >
          {tested
            ? "Tested"
            : candidate.status === "already_covered"
              ? "Already covered"
              : "Test failed"}
        </span>
      </div>

      {candidate.reason && (
        <p className="mt-3 text-sm leading-5 text-slate-400">
          {candidate.reason}
        </p>
      )}

      {candidate.message && (
        <p className="mt-3 break-words text-xs leading-5 text-slate-400">
          {candidate.message}
        </p>
      )}

      {tested && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Baseline median"
              value={formatMs(candidate.before?.benchmark?.medianLatencyMs)}
            />
            <Metric
              label="Candidate median"
              value={formatMs(candidate.after?.benchmark?.medianLatencyMs)}
            />
            <Metric
              label="Latency improvement"
              value={
                improvement == null
                  ? "N/A"
                  : `${improvement > 0 ? "+" : ""}${improvement}%`
              }
              detail="Positive means lower latency"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Metric
              label="Documents examined reduction"
              value={Number(candidate.documentsExaminedChange ?? 0).toLocaleString()}
              detail="Baseline minus candidate"
            />
            <Metric
              label="Candidate index keys examined"
              value={Number(
                candidate.after?.performance?.totalKeysExamined ?? 0,
              ).toLocaleString()}
            />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <PerformanceSummary title="Baseline scan" data={candidate.before} />
            <PerformanceSummary
              title="Candidate index"
              data={candidate.after}
            />
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={onSelect}
            className={`mt-4 w-full rounded-md px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              selected
                ? "border border-amber-500 text-amber-300"
                : "border border-[#34404D] text-slate-200 hover:border-amber-500"
            }`}
          >
            {selected ? "Selected for application" : "Select this index"}
          </button>
        </>
      )}
    </article>
  );
}

function Benchmarks() {
  const { connection, collection } = useConnection();

  const [filterText, setFilterText] = useState('{\n  "city": "Hyderabad"\n}');
  const [baseline, setBaseline] = useState(null);
  const [candidateResults, setCandidateResults] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmApply, setConfirmApply] = useState(false);

  function buildPayload() {
    if (!connection?.connectionId) {
      throw new Error(
        "Connect a MongoDB database on the Database Connections page first.",
      );
    }

    if (!collection) {
      throw new Error(
        "Select a collection on the Database Connections page first.",
      );
    }

    let filter;

    try {
      filter = JSON.parse(filterText);
    } catch {
      throw new Error("Invalid JSON. Check your brackets, quotes, and commas.");
    }

    if (!filter || Array.isArray(filter) || typeof filter !== "object") {
      throw new Error("The filter must be a JSON object.");
    }

    return {
      connectionId: connection.connectionId,
      collection,
      filter,
    };
  }

  function clearResults() {
    setBaseline(null);
    setCandidateResults(null);
    setSelectedCandidate(null);
    setConfirmApply(false);
    setSuccess("");
  }

  async function runBaseline(event) {
    event.preventDefault();
    setError("");
    clearResults();

    let payload;

    try {
      payload = buildPayload();
    } catch (err) {
      setError(err.message);
      return;
    }

    setLoading(true);
    setMode("baseline");

    try {
      const response = await api.post("/benchmarks/run", payload);
      setBaseline(response.data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to run the benchmark. Check your connection and backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function runCandidates() {
    setError("");
    clearResults();

    let payload;

    try {
      payload = buildPayload();
    } catch (err) {
      setError(err.message);
      return;
    }

    setLoading(true);
    setMode("candidates");

    try {
      const response = await api.post("/benchmarks/candidates", payload);
      setCandidateResults(response.data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to test candidate indexes.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function applySelectedIndex() {
    if (!selectedCandidate || selectedCandidate.status !== "tested") {
      setError("Select a successfully tested candidate first.");
      return;
    }

    let payload;

    try {
      payload = buildPayload();
    } catch (err) {
      setError(err.message);
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);
    setMode("apply");

    try {
      const response = await api.post("/benchmarks/apply-index", {
        ...payload,
        candidateIndex: selectedCandidate.keys,
      });

      setSuccess(
        `${response.data.message} Index name: ${response.data.indexName}`,
      );
      setConfirmApply(false);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to create the selected index.",
      );
    } finally {
      setLoading(false);
    }
  }

  const testedCandidates = (candidateResults?.candidates || []).filter(
    (candidate) => candidate.status === "tested",
  );

  return (
    <div className="space-y-6 p-5 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-amber-500">
          Performance testing
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
          Benchmarks
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Test possible indexes on a temporary sample before deciding whether
          to create an index on your original collection.
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

      <form onSubmit={runBaseline} className={`${panel} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Query filter
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Enter a MongoDB filter using fields from your selected collection.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setFilterText("{}");
              setError("");
              clearResults();
            }}
            className={buttonSecondary}
          >
            Clear filter
          </button>
        </div>

        <textarea
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={7}
          aria-label="MongoDB benchmark filter"
          placeholder={'{\n  "status": "pending"\n}'}
          className="mt-4 w-full resize-y rounded-md border border-[#34404D] bg-[#0B0F14] p-4 font-mono text-sm leading-6 text-amber-100 outline-none focus:border-amber-500"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterText("{}")}
            className={buttonSecondary}
          >
            Empty filter
          </button>
          <button
            type="button"
            onClick={() => setFilterText('{\n  "city": "Hyderabad"\n}')}
            className={buttonSecondary}
          >
            City example
          </button>
          <button
            type="button"
            onClick={() =>
              setFilterText(
                '{\n  "$and": [\n    {\n      "city": "Hyderabad"\n    },\n    {\n      "gpa": { "$gte": 8 }\n    }\n  ]\n}',
              )
            }
            className={buttonSecondary}
          >
            AND example
          </button>
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          Candidate tests use up to 1,000 sampled documents and a limited number
          of benchmark runs. Results are estimates, not guarantees of production
          performance.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mt-4 rounded-md border border-emerald-900/70 bg-emerald-950/30 p-3 text-sm text-emerald-300"
          >
            {success}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3 border-t border-[#26313D] pt-4">
          <button type="submit" disabled={loading} className={buttonPrimary}>
            {loading && mode === "baseline"
              ? "Running baseline..."
              : "Run baseline"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={runCandidates}
            className={buttonSecondary}
          >
            {loading && mode === "candidates"
              ? "Testing candidates..."
              : "Find and compare candidate indexes"}
          </button>
        </div>
      </form>

      {baseline && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Current collection baseline
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {baseline.databaseName} / {baseline.collection}
            </p>
          </div>

          <PerformanceSummary title="Current query performance" data={baseline} />
        </section>
      )}

      {candidateResults && (
        <section className="space-y-4">
          <div className={`${panel} p-5`}>
            <h2 className="text-base font-semibold text-slate-100">
              Candidate index results
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {candidateResults.databaseName} / {candidateResults.collection}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric
                label="Documents sampled"
                value={Number(candidateResults.sampleCount ?? 0).toLocaleString()}
              />
              <Metric
                label="Candidates tested"
                value={testedCandidates.length}
              />
              <Metric
                label="Candidates generated"
                value={(candidateResults.candidates || []).length}
              />
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              {candidateResults.note}
            </p>
          </div>

          {testedCandidates.length === 0 && (
            <div className={`${panel} p-5 text-sm text-slate-400`}>
              No new candidate indexes were successfully tested. Review the
              candidate statuses and messages below.
            </div>
          )}

          {(candidateResults.candidates || []).map((candidate) => (
            <CandidateCard
              key={JSON.stringify(candidate.keys)}
              candidate={candidate}
              selected={
                selectedCandidate &&
                JSON.stringify(selectedCandidate.keys) ===
                  JSON.stringify(candidate.keys)
              }
              disabled={loading || candidate.status !== "tested"}
              onSelect={() => {
                setSelectedCandidate(candidate);
                setConfirmApply(false);
                setError("");
                setSuccess("");
              }}
            />
          ))}

          {selectedCandidate && (
            <section className={`${panel} p-5`}>
              <h2 className="text-sm font-semibold text-slate-100">
                Selected index
              </h2>
              <p className="mt-3 break-all font-mono text-sm text-amber-300">
                {JSON.stringify(selectedCandidate.keys)}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Testing did not create this index on your original collection.
                Applying it will create the selected index there and may consume
                storage or affect write performance.
              </p>

              {!confirmApply ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setConfirmApply(true)}
                  className={`${buttonPrimary} mt-4`}
                >
                  Review and confirm index creation
                </button>
              ) : (
                <div className="mt-4 rounded-md border border-amber-700/60 bg-amber-950/20 p-4">
                  <p className="text-sm leading-6 text-amber-200">
                    Confirm creating this index on the original collection?
                    This action changes your database.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={applySelectedIndex}
                      className={buttonPrimary}
                    >
                      {loading && mode === "apply"
                        ? "Creating index..."
                        : "Confirm and create index"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setConfirmApply(false)}
                      className={buttonSecondary}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </section>
      )}
    </div>
  );
}

export default Benchmarks;
