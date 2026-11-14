import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RotateCcw, Sparkles } from 'lucide-react';
import type { ClusterProfile, CustomerRecord } from '../types';
import {
  AXIS_OPTIONS,
  type AxisKey,
  CLUSTER_COLORS,
  formatAxisValue,
  getAxisValue,
} from '../utils/guestInsights';

interface ClusterMapProps {
  customers: CustomerRecord[];
  clusterProfiles: ClusterProfile[];
  onSelectCustomer: (c: CustomerRecord) => void;
}

interface GuestDotDatum {
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  cluster_id: number;
  cluster_name: string;
  customer: CustomerRecord;
  isCentroid?: false;
}

interface CentroidDatum {
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  cluster_id: number;
  cluster_name: string;
  customer_count: number;
  dimmed: boolean;
  isCentroid: true;
}

interface PresetDef {
  id: string;
  label: string;
  xKey: AxisKey;
  yKey: AxisKey;
}

const PRESETS: PresetDef[] = [
  { id: 'visits_spend', label: 'Visits vs. Spend', xKey: 'total_visits', yKey: 'avg_spend_per_visit_inr' },
  { id: 'discount_rating', label: 'Discount vs. Rating', xKey: 'discount_pct', yKey: 'avg_rating_given' },
  { id: 'party_bill', label: 'Party Size vs. Avg Bill', xKey: 'avg_group_size', yKey: 'avg_spend_per_visit_inr' },
];

function deterministicOffset(id: string, amplitude: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1000;
  }
  return ((hash / 999) - 0.5) * 2 * amplitude;
}

function GuestDotShape(props: {
  cx?: number;
  cy?: number;
  payload?: GuestDotDatum;
  color: string;
  dimmed: boolean;
  onSelectCustomer: (c: CustomerRecord) => void;
}) {
  const { cx, cy, payload, color, dimmed, onSelectCustomer } = props;
  if (cx === undefined || cy === undefined || !Number.isFinite(cx) || !Number.isFinite(cy) || !payload) {
    return null;
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={dimmed ? 3.8 : 5.2}
      fill={color}
      fillOpacity={dimmed ? 0.14 : 0.82}
      stroke="#ffffff"
      strokeOpacity={dimmed ? 0.25 : 0.85}
      strokeWidth={1.1}
      style={{ cursor: 'pointer', transition: 'opacity 0.16s ease' }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectCustomer(payload.customer);
      }}
    />
  );
}

function CentroidStarShape(props: { cx?: number; cy?: number; payload?: CentroidDatum }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !Number.isFinite(cx) || !Number.isFinite(cy)) {
    return null;
  }
  const rOuter = 11.5;
  const rInner = 5;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }

  return (
    <g style={{ opacity: payload?.dimmed ? 0.22 : 1, pointerEvents: 'all' }}>
      <polygon points={pts.join(' ')} fill="#18181b" stroke="#ffffff" strokeWidth={2} />
    </g>
  );
}

function CustomMapTooltip({
  active,
  payload,
  xKey,
  yKey,
}: {
  active?: boolean;
  payload?: Array<{ payload?: GuestDotDatum | CentroidDatum }>;
  xKey: AxisKey;
  yKey: AxisKey;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const xLabel = AXIS_OPTIONS.find((a) => a.key === xKey)?.shortLabel || xKey;
  const yLabel = AXIS_OPTIONS.find((a) => a.key === yKey)?.shortLabel || yKey;
  const color = CLUSTER_COLORS[item.cluster_id]?.main || '#ab6446';

  if (item.isCentroid) {
    return (
      <div className="cluster-map-tooltip">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm leading-none">★</span>
          <strong className="text-xs text-zinc-900">{item.cluster_name} Center</strong>
        </div>
        <div className="text-[11px] text-slate-600 space-y-0.5">
          <div>
            Group Size: <strong className="text-zinc-900">{item.customer_count} guests</strong>
          </div>
          <div>
            Avg {xLabel}: <strong className="text-zinc-900">{formatAxisValue(item.rawX, xKey)}</strong>
          </div>
          <div>
            Avg {yLabel}: <strong className="text-zinc-900">{formatAxisValue(item.rawY, yKey)}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cluster-map-tooltip">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <strong className="text-xs text-zinc-900">{item.customer.customer_name}</strong>
      </div>
      <div className="text-[11px] font-medium mb-1" style={{ color }}>
        {item.cluster_name}
      </div>
      <div className="text-[11px] text-slate-600 space-y-0.5">
        <div>
          {xLabel}: <strong className="text-zinc-900">{formatAxisValue(item.rawX, xKey)}</strong>
        </div>
        <div>
          {yLabel}: <strong className="text-zinc-900">{formatAxisValue(item.rawY, yKey)}</strong>
        </div>
      </div>
      <div className="mt-1.5 pt-1 border-t border-slate-100 text-[10px] font-medium text-slate-400">
        Click dot for Guest Insight Popup →
      </div>
    </div>
  );
}

export function ClusterMap({
  customers,
  clusterProfiles,
  onSelectCustomer,
}: ClusterMapProps) {
  const [xKey, setXKey] = useState<AxisKey>('total_visits');
  const [yKey, setYKey] = useState<AxisKey>('avg_spend_per_visit_inr');
  const [focusedClusterId, setFocusedClusterId] = useState<number | null>(null);

  const activePreset = PRESETS.find((p) => p.xKey === xKey && p.yKey === yKey)?.id || null;

  const { byCluster, centroids, plottedCount, skippedCount } = useMemo(() => {
    const groups: Record<number, GuestDotDatum[]> = { 0: [], 1: [], 2: [], 3: [] };
    let plotted = 0;
    let skipped = 0;

    for (const c of customers) {
      const rawX = getAxisValue(c, xKey);
      const rawY = getAxisValue(c, yKey);
      if (rawX === null || rawY === null || !Number.isFinite(rawX) || !Number.isFinite(rawY)) {
        skipped++;
        continue;
      }

      const xJitter =
        xKey === 'avg_group_size'
          ? deterministicOffset(c.customer_id, 0.16)
          : xKey === 'avg_rating_given'
          ? deterministicOffset(c.customer_id, 0.04)
          : 0;
      const yJitter =
        yKey === 'avg_group_size'
          ? deterministicOffset(c.customer_id + '_y', 0.14)
          : yKey === 'avg_rating_given'
          ? deterministicOffset(c.customer_id + '_y', 0.03)
          : 0;

      const cid = c.cluster_id in groups ? c.cluster_id : 0;
      groups[cid].push({
        x: rawX + xJitter,
        y: rawY + yJitter,
        rawX,
        rawY,
        cluster_id: cid,
        cluster_name: c.cluster_name || CLUSTER_COLORS[cid]?.label || `Group ${cid + 1}`,
        customer: c,
      });
      plotted++;
    }

    const stars: CentroidDatum[] = [0, 1, 2, 3]
      .map((cid) => {
        const list = groups[cid];
        if (!list || list.length === 0) return null;
        const meanX = list.reduce((s, d) => s + d.rawX, 0) / list.length;
        const meanY = list.reduce((s, d) => s + d.rawY, 0) / list.length;
        const prof = clusterProfiles.find((p) => p.cluster_id === cid);
        return {
          x: Number(meanX.toFixed(2)),
          y: Number(meanY.toFixed(2)),
          rawX: Number(meanX.toFixed(2)),
          rawY: Number(meanY.toFixed(2)),
          cluster_id: cid,
          cluster_name: prof?.cluster_name || CLUSTER_COLORS[cid]?.label || `Group ${cid + 1}`,
          customer_count: prof?.customer_count ?? list.length,
          dimmed: focusedClusterId !== null && focusedClusterId !== cid,
          isCentroid: true as const,
        };
      })
      .filter((v): v is CentroidDatum => v !== null);

    return { byCluster: groups, centroids: stars, plottedCount: plotted, skippedCount: skipped };
  }, [customers, clusterProfiles, xKey, yKey, focusedClusterId]);

  const xOpt = AXIS_OPTIONS.find((o) => o.key === xKey)!;
  const yOpt = AXIS_OPTIONS.find((o) => o.key === yKey)!;

  const formatTick = (v: number, key: AxisKey): string => {
    if (!Number.isFinite(v)) return '';
    if (key === 'avg_spend_per_visit_inr' || key === 'total_spend_inr') {
      return v >= 1000 ? `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `₹${Math.round(v)}`;
    }
    if (key === 'discount_pct') return `${Math.round(v)}%`;
    if (key === 'avg_rating_given') return v.toFixed(1);
    return `${Math.round(v)}`;
  };

  return (
    <section className="surface-card cluster-map-panel" aria-label="Interactive Cluster Map">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="studio-eyebrow" style={{ marginBottom: 0 }}>
              INTERACTIVE CLUSTER MAP
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {plottedCount.toLocaleString()} guests plotted
              {skippedCount > 0 ? ` (${skippedCount} without rating)` : ''}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-zinc-900 mt-0.5 flex items-center gap-1.5">
            <Sparkles size={16} style={{ color: 'var(--brand)' }} />
            Explore Guest Groups Visually
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Each dot is a guest. Same colors mean similar dining habits. ★ marks each group&apos;s center.
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[0, 1, 2, 3].map((cid) => {
            const cColor = CLUSTER_COLORS[cid];
            const prof = clusterProfiles.find((p) => p.cluster_id === cid);
            const isSelected = focusedClusterId === cid;
            const isMuted = focusedClusterId !== null && !isSelected;
            return (
              <button
                key={cid}
                type="button"
                className={`cluster-legend-pill ${isSelected ? 'active' : ''}`}
                style={{
                  borderColor: isSelected ? cColor.main : undefined,
                  backgroundColor: isSelected ? cColor.soft : undefined,
                  opacity: isMuted ? 0.52 : 1,
                }}
                onClick={() => setFocusedClusterId((prev) => (prev === cid ? null : cid))}
                title="Click to highlight or filter this dining group"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cColor.main }}
                />
                <span>{prof?.cluster_name || cColor.label}</span>
                <span className="text-[10px] text-slate-500 font-semibold">
                  {prof?.customer_count ?? byCluster[cid]?.length ?? 0}
                </span>
              </button>
            );
          })}
          {focusedClusterId !== null && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ padding: '4px 10px', fontSize: '0.7rem' }}
              onClick={() => setFocusedClusterId(null)}
            >
              <RotateCcw size={11} /> All
            </button>
          )}
        </div>
      </div>

      <div className="cluster-map-controls mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-slate-500 mr-1">Quick Views:</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`preset-pill-btn ${activePreset === p.id ? 'active' : ''}`}
              onClick={() => {
                setXKey(p.xKey);
                setYKey(p.yKey);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium">X:</span>
            <select
              className="field-input"
              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
              value={xKey}
              onChange={(e) => setXKey(e.target.value as AxisKey)}
            >
              {AXIS_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium">Y:</span>
            <select
              className="field-input"
              style={{ padding: '5px 10px', fontSize: '0.74rem' }}
              value={yKey}
              onChange={(e) => setYKey(e.target.value as AxisKey)}
            >
              {AXIS_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="w-full" style={{ height: 370 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 14, right: 18, bottom: 20, left: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="x"
              name={xOpt.shortLabel}
              tickFormatter={(v) => formatTick(Number(v), xKey)}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={{ stroke: '#cbd5e1' }}
              label={{
                value: xOpt.label,
                position: 'insideBottom',
                offset: -10,
                style: { fontSize: 11, fontWeight: 600, fill: '#475569' },
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yOpt.shortLabel}
              tickFormatter={(v) => formatTick(Number(v), yKey)}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={{ stroke: '#cbd5e1' }}
              width={62}
              label={{
                value: yOpt.shortLabel,
                angle: -90,
                position: 'insideLeft',
                offset: 4,
                style: { fontSize: 11, fontWeight: 600, fill: '#475569' },
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }}
              content={<CustomMapTooltip xKey={xKey} yKey={yKey} />}
            />

            {[0, 1, 2, 3].map((cid) => {
              const dimmed = focusedClusterId !== null && focusedClusterId !== cid;
              const color = CLUSTER_COLORS[cid].main;
              return (
                <Scatter
                  key={cid}
                  name={CLUSTER_COLORS[cid].label}
                  data={byCluster[cid] || []}
                  fill={color}
                  isAnimationActive={false}
                  shape={(shapeProps: unknown) => {
                    const p = shapeProps as { cx?: number; cy?: number; payload?: GuestDotDatum };
                    return (
                      <GuestDotShape
                        cx={p.cx}
                        cy={p.cy}
                        payload={p.payload}
                        color={color}
                        dimmed={dimmed}
                        onSelectCustomer={onSelectCustomer}
                      />
                    );
                  }}
                />
              );
            })}

            <Scatter
              name="Group Centers (★)"
              data={centroids}
              fill="#18181b"
              isAnimationActive={false}
              shape={(shapeProps: unknown) => {
                const p = shapeProps as { cx?: number; cy?: number; payload?: CentroidDatum };
                return <CentroidStarShape cx={p.cx} cy={p.cy} payload={p.payload} />;
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-500">
        <span>
          <strong className="text-zinc-900">★</strong> Dark stars show the average center of each group.
        </span>
        <span>Tip: Click any dot on the map to inspect why that guest belongs to their group.</span>
      </div>
    </section>
  );
}