import type { CustomerRecord } from '../types';
import { cleanLabel, formatINR } from './formatters';

export type AxisKey =
  | 'total_visits'
  | 'avg_spend_per_visit_inr'
  | 'total_spend_inr'
  | 'discount_pct'
  | 'avg_group_size'
  | 'avg_rating_given';

export const CLUSTER_COLORS: Record<number, { main: string; soft: string; border: string; label: string }> = {
  0: { main: '#ab6446', soft: 'rgba(171, 100, 70, 0.11)', border: 'rgba(171, 100, 70, 0.34)', label: 'Frequent Visitors' },
  1: { main: '#0284c7', soft: 'rgba(2, 132, 199, 0.11)', border: 'rgba(2, 132, 199, 0.34)', label: 'Premium Customers' },
  2: { main: '#d97706', soft: 'rgba(217, 119, 6, 0.12)', border: 'rgba(217, 119, 6, 0.35)', label: 'Family Visitors' },
  3: { main: '#7c3aed', soft: 'rgba(124, 58, 237, 0.11)', border: 'rgba(124, 58, 237, 0.34)', label: 'Coupon Grabbers' },
};

export const AXIS_OPTIONS: Array<{ key: AxisKey; label: string; shortLabel: string }> = [
  { key: 'total_visits', label: 'Total Visits', shortLabel: 'Visits' },
  { key: 'avg_spend_per_visit_inr', label: 'Avg Spend/Visit', shortLabel: 'Avg/Visit (₹)' },
  { key: 'total_spend_inr', label: 'Total Spend', shortLabel: 'Total Spend (₹)' },
  { key: 'discount_pct', label: 'Discount Usage %', shortLabel: 'Discount %' },
  { key: 'avg_group_size', label: 'Party Size', shortLabel: 'Party Size' },
  { key: 'avg_rating_given', label: 'Rating', shortLabel: 'Rating' },
];

export function getAxisValue(c: CustomerRecord, key: AxisKey): number | null {
  switch (key) {
    case 'total_visits':
      return Number.isFinite(Number(c.total_visits)) ? Number(c.total_visits) : 0;
    case 'avg_spend_per_visit_inr':
      return Number.isFinite(Number(c.avg_spend_per_visit_inr)) ? Number(c.avg_spend_per_visit_inr) : 0;
    case 'total_spend_inr':
      return Number.isFinite(Number(c.total_spend_inr)) ? Number(c.total_spend_inr) : 0;
    case 'discount_pct':
      return Math.round((Number(c.discount_rate) || 0) * 100);
    case 'avg_group_size':
      return Number.isFinite(Number(c.avg_group_size)) ? Number(c.avg_group_size) : 1;
    case 'avg_rating_given':
      return c.avg_rating_given !== null &&
        c.avg_rating_given !== undefined &&
        Number.isFinite(Number(c.avg_rating_given))
        ? Number(c.avg_rating_given)
        : null;
  }
}

export function formatAxisValue(val: number | null, key: AxisKey): string {
  if (val === null || !Number.isFinite(val)) return 'N/A';
  if (key === 'avg_spend_per_visit_inr' || key === 'total_spend_inr') {
    return formatINR(val);
  }
  if (key === 'discount_pct') {
    return `${Math.round(val)}%`;
  }
  if (key === 'avg_rating_given') {
    return `${val.toFixed(1)} / 5`;
  }
  if (key === 'avg_group_size') {
    return `${Number(val.toFixed(1))}`;
  }
  return `${Math.round(val)}`;
}

interface FeatureStats {
  mean: number;
  std: number;
  p90: number;
  p95: number;
}

function computeAllFeatureStats(customers: CustomerRecord[]): Record<AxisKey, FeatureStats> {
  const keys: AxisKey[] = [
    'total_visits',
    'avg_spend_per_visit_inr',
    'total_spend_inr',
    'discount_pct',
    'avg_group_size',
    'avg_rating_given',
  ];
  const result = {} as Record<AxisKey, FeatureStats>;

  for (const key of keys) {
    const vals = customers
      .map((c) => getAxisValue(c, key))
      .filter((v): v is number => v !== null && Number.isFinite(v));

    if (vals.length === 0) {
      result[key] = { mean: 0, std: 1, p90: 1, p95: 1 };
      continue;
    }

    const sorted = [...vals].sort((a, b) => a - b);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance) || 1;
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];

    result[key] = { mean, std, p90, p95 };
  }

  return result;
}

export interface ClusterMatchResult {
  isCoreMember: boolean;
  badgeText: string;
  secondClusterId: number;
  secondClusterName: string;
  ownDistance: number;
  secondDistance: number;
}

export function computeGuestClusterMatch(
  customer: CustomerRecord,
  allCustomers: CustomerRecord[]
): ClusterMatchResult {
  const keys: AxisKey[] = [
    'total_visits',
    'avg_spend_per_visit_inr',
    'total_spend_inr',
    'discount_pct',
    'avg_group_size',
    'avg_rating_given',
  ];

  if (allCustomers.length === 0) {
    return {
      isCoreMember: true,
      badgeText: '★ Core Member',
      secondClusterId: 0,
      secondClusterName: 'Frequent Visitors',
      ownDistance: 0,
      secondDistance: 1,
    };
  }

  const stats = computeAllFeatureStats(allCustomers);

  const toZVec = (c: CustomerRecord): number[] =>
    keys.map((k) => {
      const raw = getAxisValue(c, k);
      const val = raw === null ? stats[k].mean : raw;
      return (val - stats[k].mean) / stats[k].std;
    });

  const centroids: Record<number, { vec: number[]; name: string }> = {};
  for (const cid of [0, 1, 2, 3]) {
    const members = allCustomers.filter((c) => c.cluster_id === cid);
    const sumVec = new Array<number>(keys.length).fill(0);
    if (members.length > 0) {
      for (const m of members) {
        const zv = toZVec(m);
        for (let i = 0; i < keys.length; i++) sumVec[i] += zv[i];
      }
      for (let i = 0; i < keys.length; i++) sumVec[i] /= members.length;
    }
    centroids[cid] = {
      vec: sumVec,
      name: members[0]?.cluster_name || CLUSTER_COLORS[cid]?.label || `Group ${cid + 1}`,
    };
  }

  const gVec = toZVec(customer);
  const distTo = (cid: number): number => {
    const cv = centroids[cid].vec;
    let sq = 0;
    for (let i = 0; i < keys.length; i++) {
      const d = gVec[i] - cv[i];
      sq += d * d;
    }
    return Math.sqrt(sq);
  };

  const ownDist = distTo(customer.cluster_id);
  let secondCid = customer.cluster_id === 0 ? 1 : 0;
  let secondDist = Infinity;

  for (const cid of [0, 1, 2, 3]) {
    if (cid === customer.cluster_id) continue;
    const d = distTo(cid);
    if (d < secondDist) {
      secondDist = d;
      secondCid = cid;
    }
  }

  const secondName = centroids[secondCid]?.name || CLUSTER_COLORS[secondCid]?.label || 'Another Group';
  const isCoreMember = ownDist <= secondDist * 0.8;

  return {
    isCoreMember,
    badgeText: isCoreMember ? '★ Core Member' : `⇄ On the Border (close to ${secondName})`,
    secondClusterId: secondCid,
    secondClusterName: secondName,
    ownDistance: Number(ownDist.toFixed(2)),
    secondDistance: Number(secondDist.toFixed(2)),
  };
}

export function buildPlainEnglishReason(
  customer: CustomerRecord,
  allCustomers: CustomerRecord[]
): string {
  const stats = computeAllFeatureStats(allCustomers.length ? allCustomers : [customer]);
  const avgVisits = Math.max(1, stats.total_visits.mean);
  const avgBill = Math.max(1, stats.avg_spend_per_visit_inr.mean);
  const avgDiscount = Math.round(stats.discount_pct.mean);

  const visitMult = customer.total_visits / avgVisits;
  const spendMult = customer.avg_spend_per_visit_inr / avgBill;
  const discPct = Math.round((Number(customer.discount_rate) || 0) * 100);

  if (customer.cluster_id === 1) {
    return spendMult >= 1.25
      ? `Spends ${spendMult.toFixed(1)}× the restaurant average per visit (${formatINR(customer.avg_spend_per_visit_inr)}) with strong preference for ${customer.top_food_category}.`
      : `Maintains premium dining spend (${formatINR(customer.total_spend_inr)} total) with consistent high-value orders.`;
  }

  if (customer.cluster_id === 2) {
    const kidsNote = customer.total_children > 0 ? ` and ${customer.total_children} children` : '';
    return `Usually dines in larger groups (party of ${customer.avg_group_size}${kidsNote}) on ${customer.preferred_day_type.toLowerCase()}s, spending ${formatINR(customer.avg_spend_per_visit_inr)} per visit.`;
  }

  if (customer.cluster_id === 3) {
    return `Uses offers on ${discPct}% of visits (vs ${avgDiscount}% restaurant avg), with budget-friendly orders averaging ${formatINR(customer.avg_spend_per_visit_inr)}.`;
  }

  return visitMult >= 1.15
    ? `Visits ${visitMult.toFixed(1)}× more than average (${customer.total_visits} times), with steady ${formatINR(customer.avg_spend_per_visit_inr)} spend per visit.`
    : `Dines steadily with ${customer.total_visits} visits and ${formatINR(customer.avg_spend_per_visit_inr)} average spend per visit.`;
}

export interface StatComparisonItem {
  key: AxisKey;
  label: string;
  formattedValue: string;
  formattedAvg: string;
  pillText: 'Top 10%' | '↑ Above Avg' | '↓ Below Avg' | '≈ Near Avg' | 'No Rating';
  pillTone: 'gold' | 'green' | 'rose' | 'slate';
}

export function buildStatComparisons(
  customer: CustomerRecord,
  allCustomers: CustomerRecord[]
): StatComparisonItem[] {
  const stats = computeAllFeatureStats(allCustomers.length ? allCustomers : [customer]);
  const defs: Array<{ key: AxisKey; label: string }> = [
    { key: 'total_visits', label: 'Visits' },
    { key: 'avg_spend_per_visit_inr', label: 'Avg/Visit' },
    { key: 'total_spend_inr', label: 'Total Spend' },
    { key: 'avg_group_size', label: 'Party Size' },
    { key: 'avg_rating_given', label: 'Rating' },
    { key: 'discount_pct', label: 'Discount %' },
  ];

  return defs.map(({ key, label }) => {
    const val = getAxisValue(customer, key);
    const st = stats[key];

    if (val === null) {
      return {
        key,
        label,
        formattedValue: 'N/A',
        formattedAvg: formatAxisValue(st.mean, key),
        pillText: 'No Rating',
        pillTone: 'slate',
      };
    }

    let pillText: StatComparisonItem['pillText'] = '≈ Near Avg';
    let pillTone: StatComparisonItem['pillTone'] = 'slate';

    if (val >= st.p90 && val > st.mean * 1.05) {
      pillText = 'Top 10%';
      pillTone = 'gold';
    } else if (val >= st.mean * 1.06) {
      pillText = '↑ Above Avg';
      pillTone = 'green';
    } else if (val <= st.mean * 0.92) {
      pillText = '↓ Below Avg';
      pillTone = 'rose';
    }

    return {
      key,
      label,
      formattedValue: formatAxisValue(val, key),
      formattedAvg: formatAxisValue(st.mean, key),
      pillText,
      pillTone,
    };
  });
}

export interface PathToVipResult {
  isVip: boolean;
  progressPct: number;
  labelText: string;
  vipThresholdInr: number;
}

export function computePathToVip(
  customer: CustomerRecord,
  allCustomers: CustomerRecord[]
): PathToVipResult {
  if (customer.cluster_id === 1) {
    return {
      isVip: true,
      progressPct: 100,
      labelText: 'VIP Status Secured',
      vipThresholdInr: Math.round(customer.avg_spend_per_visit_inr),
    };
  }

  const premiumSpends = allCustomers
    .filter((c) => c.cluster_id === 1 && Number.isFinite(c.avg_spend_per_visit_inr))
    .map((c) => c.avg_spend_per_visit_inr)
    .sort((a, b) => a - b);

  const vipThreshold =
    premiumSpends.length > 0
      ? Math.round(premiumSpends[Math.floor(premiumSpends.length * 0.15)])
      : 1450;

  const currentSpend = Math.max(0, Number(customer.avg_spend_per_visit_inr) || 0);
  const diff = Math.round(vipThreshold - currentSpend);
  const pct = Math.min(99, Math.max(4, Math.round((currentSpend / Math.max(1, vipThreshold)) * 100)));

  if (diff <= 0) {
    return {
      isVip: false,
      progressPct: 94,
      labelText: `94% to VIP — Steady repeat visits with ${customer.top_food_category} will qualify`,
      vipThresholdInr: vipThreshold,
    };
  }

  return {
    isVip: false,
    progressPct: pct,
    labelText: `${pct}% to VIP — ~${formatINR(diff)} more/visit needed`,
    vipThresholdInr: vipThreshold,
  };
}

export interface RadarDatum {
  metric: string;
  guestScore: number;
  groupAvgScore: number;
  guestRaw: string;
  groupRaw: string;
}

export function buildRadarComparisonData(
  customer: CustomerRecord,
  allCustomers: CustomerRecord[]
): RadarDatum[] {
  const pool = allCustomers.length > 0 ? allCustomers : [customer];
  const stats = computeAllFeatureStats(pool);
  const groupMembers = pool.filter((c) => c.cluster_id === customer.cluster_id);
  const groupPool = groupMembers.length > 0 ? groupMembers : [customer];

  const axes: Array<{ key: AxisKey; label: string; fixedMax?: number }> = [
    { key: 'total_visits', label: 'Visits' },
    { key: 'avg_spend_per_visit_inr', label: 'Avg/Visit' },
    { key: 'total_spend_inr', label: 'Total Spend' },
    { key: 'avg_group_size', label: 'Party Size', fixedMax: 6 },
    { key: 'avg_rating_given', label: 'Rating', fixedMax: 5 },
    { key: 'discount_pct', label: 'Discount %', fixedMax: 100 },
  ];

  return axes.map(({ key, label, fixedMax }) => {
    const scaleMax = fixedMax ?? Math.max(1, stats[key].p95 * 1.1);
    const guestVal = getAxisValue(customer, key);
    const groupVals = groupPool
      .map((m) => getAxisValue(m, key))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const groupMean =
      groupVals.length > 0 ? groupVals.reduce((a, b) => a + b, 0) / groupVals.length : stats[key].mean;

    const effectiveGuestVal = guestVal ?? groupMean;
    const guestScore = Math.min(100, Math.max(5, Math.round((effectiveGuestVal / scaleMax) * 100)));
    const groupAvgScore = Math.min(100, Math.max(5, Math.round((groupMean / scaleMax) * 100)));

    return {
      metric: label,
      guestScore,
      groupAvgScore,
      guestRaw: formatAxisValue(guestVal, key),
      groupRaw: formatAxisValue(groupMean, key),
    };
  });
}

export function buildStaffHospitalityTip(customer: CustomerRecord): string {
  const dish =
    customer.most_ordered_dish && customer.most_ordered_dish.trim()
      ? customer.most_ordered_dish.trim()
      : customer.top_food_category || 'Chef’s Specials';
  const meal = cleanLabel(customer.preferred_meal_time || 'Dinner');
  const day = customer.preferred_day_type || 'Weekend';

  if (customer.cluster_id === 1) {
    return `Offer priority ${day.toLowerCase()} ${meal.toLowerCase()} seating and have staff personally check on their ${dish} experience—keep hospitality refined with no coupons or discounts.`;
  }

  if (customer.cluster_id === 2) {
    return `Prepare a comfortable ${customer.avg_group_size}-seat family table for ${day.toLowerCase()} ${meal.toLowerCase()} and suggest sharing platters alongside ${dish}.`;
  }

  if (customer.cluster_id === 3) {
    return `Greet warmly on arrival and highlight value combos featuring ${dish} or weekday savings to encourage a higher-ticket return visit.`;
  }

  return customer.days_since_last_visit >= 35
    ? `Guest hasn't visited in ${customer.days_since_last_visit} days—welcome them back warmly with a quick reminder of their favourite ${dish}.`
    : `Recognize them as a valued regular (${customer.total_visits} visits) and suggest pairing ${dish} with a signature dessert or beverage.`;
}