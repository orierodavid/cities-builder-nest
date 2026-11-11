"use client";

type GrowthPoint = { month: string; label: string; payment_count: number; collected_kobo: number };
type EstatePerformance = { estate_id: string; estate_name: string; payment_count: number; collected_kobo: number; outstanding_kobo: number; active_charges: number };
export type PlatformGrowthData = {
  summary: { verified_payments: number; active_charges: number; outstanding_kobo: number; collected_kobo: number };
  trend: GrowthPoint[];
  estates: EstatePerformance[];
};

const money = (kobo: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", notation: "compact", maximumFractionDigits: 1,
}).format((Number(kobo) || 0) / 100);
const compact = (value: number) => new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);

export default function PlatformGrowthCharts({ data, loading, error }: {
  data: PlatformGrowthData | null; loading: boolean; error: string;
}) {
  const points = data?.trend ?? [];
  const maxValue = Math.max(1, ...points.map(point => Number(point.collected_kobo) || 0));
  const coords = points.map((point, index) => ({
    x: points.length < 2 ? 360 : 42 + index * (636 / (points.length - 1)),
    y: 190 - ((Number(point.collected_kobo) || 0) / maxValue) * 150,
  }));
  const line = coords.map(point => point.x + "," + point.y).join(" ");
  const area = coords.length ? "M " + coords[0].x + " 190 L " + coords.map(point => point.x + " " + point.y).join(" L ") + " L " + coords[coords.length - 1].x + " 190 Z" : "";
  const topEstates = data?.estates ?? [];
  const maxCollection = Math.max(1, ...topEstates.map(estate => Number(estate.collected_kobo) || 0));

  return <>
    <section className="growth-panel">
      <div className="growth-panel-head">
        <div><span className="growth-eyebrow">PLATFORM OVERVIEW</span><h3>Estate Growth</h3><p>Verified service-charge collections across the last 12 months</p></div>
        <span className="growth-period">12 MONTHS</span>
      </div>
      {loading ? <div className="growth-state">Loading verified payment history…</div> : error ? <div className="growth-state growth-error">{error}</div> : !data || points.every(point => Number(point.collected_kobo) === 0) ? <div className="growth-state"><strong>No verified collections yet</strong><span>Monthly collection trends will appear here when successful service-charge payments are recorded.</span></div> : <>
        <div className="growth-chart-summary"><strong>{money(data.summary.collected_kobo)}</strong><span>Total verified collections</span></div>
        <div className="growth-chart-wrap">
          <svg className="growth-chart" viewBox="0 0 720 238" role="img" aria-label="Monthly verified service charge collections over the last 12 months">
            {[40, 90, 140, 190].map(y => <line key={y} x1="42" x2="678" y1={y} y2={y} className="growth-gridline" />)}
            <path d={area} className="growth-area" />
            <polyline points={line} className="growth-line" />
            {coords.map((point, index) => <g key={points[index].month}><circle cx={point.x} cy={point.y} r="4" className="growth-point"><title>{points[index].label}: {money(points[index].collected_kobo)} · {compact(points[index].payment_count)} payments</title></circle><text x={point.x} y="218" textAnchor="middle" className="growth-axis-label">{points[index].label}</text></g>)}
          </svg>
        </div>
        <div className="growth-chart-foot"><span><i className="growth-legend-dot" /> Verified collections</span><span>Amounts shown in NGN</span></div>
      </>}
    </section>
    <section className="growth-panel estate-performance-panel">
      <div className="growth-panel-head"><div><span className="growth-eyebrow">COLLECTION LEADERBOARD</span><h3>Top Performing Estates</h3><p>Ranked by verified collections, with outstanding balances alongside</p></div></div>
      {loading ? <div className="growth-state">Loading estate performance…</div> : error ? <div className="growth-state growth-error">{error}</div> : topEstates.length === 0 ? <div className="growth-state"><strong>No estate insights yet</strong><span>Estate comparisons will appear when estates and payment records are available.</span></div> : <div className="estate-ranking">{topEstates.map((estate, index) => <article className="estate-rank" key={estate.estate_id}><div className="estate-rank-top"><span className="estate-rank-name"><b>{String(index + 1).padStart(2, "0")}</b>{estate.estate_name}</span><strong>{money(estate.collected_kobo)}</strong></div><div className="estate-bar-track"><span style={{ width: Math.max(2, (Number(estate.collected_kobo) / maxCollection) * 100) + "%" }} /></div><div className="estate-rank-meta"><span>{compact(estate.payment_count)} verified payments · {estate.active_charges} active charges</span><span>Outstanding <strong>{money(estate.outstanding_kobo)}</strong></span></div></article>)}</div>}
    </section>
  </>;
}
