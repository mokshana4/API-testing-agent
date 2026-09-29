import type { CategoryStat } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CategoryBars({ data }: { data: CategoryStat[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div>
      <div className="relative flex h-44 items-end gap-3 pl-8">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between text-[10px] text-dim">
          {["100%", "75%", "50%", "25%", "0"].map((l) => <span key={l}>{l}</span>)}
        </div>
        <div className="grid-bg pointer-events-none absolute inset-y-0 left-8 right-0" />
        {data.map((c) => (
          <div key={c.name} className="relative flex h-full flex-1 items-end justify-center" title={`${c.name}: ${c.passed} passed, ${c.failed} failed`}>
            <div className="flex w-full max-w-[30px] flex-col overflow-hidden rounded-t-md rounded-b-sm" style={{ height: `${Math.max((c.total / max) * 100, c.total ? 3 : 0)}%` }}>
              <div className="bg-fail-grad" style={{ height: `${c.total ? (c.failed / c.total) * 100 : 0}%` }} />
              <div className="flex-1 bg-brand-grad-v" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 pl-8">
        {data.map((c) => (
          <div key={c.name} className="flex-1 text-center">
            <div className="truncate text-[10.5px] capitalize text-muted">{c.name}</div>
            <div className="text-[10.5px] text-dim">{c.passed}/{c.total}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-400" />Passed</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-fuchsia-500" />Failed</span>
      </div>
    </div>
  );
}

export function Donut({ value, size = 148, label = "passed" }: { value: number; size?: number; label?: string }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={`${value}% ${label}`}>
      <defs>
        <linearGradient id="donut-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(var(--fail) / .45)" strokeWidth="12" />
      <circle cx="70" cy="70" r={r} fill="none" stroke="url(#donut-g)" strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`} transform="rotate(-90 70 70)" />
      <text x="70" y="72" textAnchor="middle" className="fill-fg" style={{ font: "500 22px Inter, sans-serif" }}>{value}%</text>
      <text x="70" y="90" textAnchor="middle" className="fill-muted" style={{ font: "10px Inter, sans-serif" }}>{label}</text>
    </svg>
  );
}

export function Sparkline({ values, height = 120, className, stroke = "#38bdf8", id = "spark" }: { values: number[]; height?: number; className?: string; stroke?: string; id?: string }) {
  const w = 520;
  const pad = 8;
  if (values.length === 0) return <div className={cn("grid place-items-center text-xs text-dim", className)} style={{ height }}>No data yet</div>;
  const top = Math.max(...values) || 1;
  const step = (w - pad * 2) / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => [pad + i * step, height - pad - (v / top) * (height - pad * 2)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M${pts[0][0]},${height - pad} L${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} L${pts[pts.length - 1][0]},${height - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn("block w-full", className)} style={{ height }} role="img">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity=".32" /><stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={w} y1={height * f} y2={height * f} stroke="rgb(var(--line) / .12)" />)}
      <path d={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Meter({ value, tone = "pass", className }: { value: number; tone?: "pass" | "fail" | "warn"; className?: string }) {
  return (
    <div className={cn("h-1.5 min-w-[72px] overflow-hidden rounded-full bg-line/15", className)}>
      <div className={cn("h-full rounded-full", tone === "pass" ? "bg-brand-grad" : tone === "warn" ? "bg-warn" : "bg-fail-grad")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
