
function MetricCard({ title, value, icon, description }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#111820] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{title}</p>
        <span className="text-lg text-amber-500">{icon}</span>
      </div>

      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-100">
        {value}
      </h2>

      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </div>
  )
}

export default MetricCard
