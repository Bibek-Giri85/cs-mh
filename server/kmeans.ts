import type { ClusterProfile, CustomerRecord, KMeansModelArtifact } from './types.ts';

export const KMEANS_FEATURE_COLUMNS: string[] = [
  'age',
  'total_visits',
  'total_spend_inr',
  'avg_spend_per_visit_inr',
  'avg_group_size',
  'total_children',
  'discount_rate',
  'days_since_last_visit',
  'avg_rating_given',
  'chicken_share',
  'veg_share',
  'mutton_share',
  'seafood_share',
  'biryani_rice_share',
  'chinese_fastfood_share',
  'dessert_beverage_share',
];

function extractFeatureVector(c: CustomerRecord, fallbackAge = 32): number[] {
  const totalFood = Math.max(
    1,
    c.chicken_orders +
      c.veg_orders +
      c.mutton_orders +
      c.seafood_orders +
      c.biryani_rice_orders +
      c.chinese_fastfood_orders +
      c.dessert_beverage_orders
  );
  const visits = Math.max(1, c.total_visits);
  const discountRate = c.discount_used_count / visits;

  return [
    c.age ?? fallbackAge,
    c.total_visits,
    c.total_spend_inr,
    c.avg_spend_per_visit_inr,
    c.avg_group_size,
    c.total_children,
    discountRate,
    c.days_since_last_visit,
    c.avg_rating_given ?? 4.2,
    c.chicken_orders / totalFood,
    c.veg_orders / totalFood,
    c.mutton_orders / totalFood,
    c.seafood_orders / totalFood,
    c.biryani_rice_orders / totalFood,
    c.chinese_fastfood_orders / totalFood,
    c.dessert_beverage_orders / totalFood,
  ];
}

function sqDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function runSingleKMeans(
  X: number[][],
  k: number,
  rand: () => number,
  maxIter = 60
): {
  labels: number[];
  centroids: number[][];
  inertia: number;
} {
  const n = X.length;
  const dims = X[0].length;
  // Standard K-Means++ probabilistic initialization (D^2 weighting)
  const centroids: number[][] = [];
  const firstIdx = Math.floor(rand() * n);
  centroids.push([...X[firstIdx]]);

  const minDists = new Array<number>(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let totalWeight = 0;
    for (let i = 0; i < n; i++) {
      const d = sqDist(X[i], centroids[c - 1]);
      if (d < minDists[i]) minDists[i] = d;
      totalWeight += minDists[i];
    }
    let nextIdx = 0;
    if (totalWeight > 0) {
      let target = rand() * totalWeight;
      for (let i = 0; i < n; i++) {
        target -= minDists[i];
        if (target <= 0) {
          nextIdx = i;
          break;
        }
      }
    } else {
      nextIdx = Math.floor(rand() * n);
    }
    centroids.push([...X[nextIdx]]);
  }

  const labels = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = sqDist(X[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (labels[i] !== bestC) {
        labels[i] = bestC;
        changed = true;
      }
    }

    const sums: number[][] = Array.from({ length: k }, () => new Array<number>(dims).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      for (let d = 0; d < dims; d++) {
        sums[c][d] += X[i][d];
      }
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dims; d++) {
          centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
    if (!changed) break;
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) {
    inertia += sqDist(X[i], centroids[labels[i]]);
  }

  return { labels, centroids, inertia };
}

function runKMeansCore(X: number[][], k: number, restarts = 12): {
  labels: number[];
  centroids: number[][];
  inertia: number;
} {
  const rand = createSeededRandom(20261114 + k);
  let best: { labels: number[]; centroids: number[][]; inertia: number } | null = null;
  for (let r = 0; r < restarts; r++) {
    const candidate = runSingleKMeans(X, k, rand);
    if (!best || candidate.inertia < best.inertia) {
      best = candidate;
    }
  }
  return best!;
}

function computeSilhouette(X: number[][], labels: number[], k: number): number {
  const totalN = X.length;
  if (totalN <= k || k < 2) return 0;

  // For very large datasets (e.g. 3000+ rows), use deterministic uniform subsample for O(M^2) speed
  const maxSample = 400;
  const step = totalN > maxSample ? totalN / maxSample : 1;
  const sampleIndices: number[] = [];
  for (let idx = 0; idx < totalN; idx += step) {
    sampleIndices.push(Math.floor(idx));
  }
  const m = sampleIndices.length;

  let totalS = 0;
  for (let si = 0; si < m; si++) {
    const i = sampleIndices[si];
    const ci = labels[i];
    let aSum = 0;
    let aCount = 0;
    const bSums = new Array<number>(k).fill(0);
    const bCounts = new Array<number>(k).fill(0);

    for (let sj = 0; sj < m; sj++) {
      if (si === sj) continue;
      const j = sampleIndices[sj];
      const dist = Math.sqrt(sqDist(X[i], X[j]));
      const cj = labels[j];
      if (cj === ci) {
        aSum += dist;
        aCount++;
      } else {
        bSums[cj] += dist;
        bCounts[cj]++;
      }
    }
    const a = aCount > 0 ? aSum / aCount : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c !== ci && bCounts[c] > 0) {
        const avg = bSums[c] / bCounts[c];
        if (avg < b) b = avg;
      }
    }
    if (!Number.isFinite(b)) b = a;
    const denom = Math.max(a, b);
    totalS += denom > 0 ? (b - a) / denom : 0;
  }
  return Number((totalS / m).toFixed(4));
}

/**
 * Dynamically assigns meaningful business-friendly cluster names & maps
 * centroids cleanly to canonical behavioral roles based on actual cluster data.
 */
function assignBusinessClusterNames(
  customers: CustomerRecord[],
  rawLabels: number[],
  k: number
): {
  canonicalLabels: number[];
  canonicalRemap: number[];
  labelMap: Record<number, { name: string; subtitle: string }>;
} {
  const groups = Array.from({ length: k }, (_, cid) => {
    const members = customers.filter((_, idx) => rawLabels[idx] === cid);
    const n = Math.max(1, members.length);
    return {
      rawId: cid,
      count: members.length,
      avgSpendPerVisit: members.reduce((s, m) => s + m.avg_spend_per_visit_inr, 0) / n,
      avgVisits: members.reduce((s, m) => s + m.total_visits, 0) / n,
      avgGroupSize: members.reduce((s, m) => s + m.avg_group_size, 0) / n,
      avgChildren: members.reduce((s, m) => s + m.total_children, 0) / n,
      avgDiscountRate: members.reduce((s, m) => s + m.discount_rate, 0) / n,
    };
  });

  // Match raw clusters to the 4 canonical Mother's Hut business segments:
  // 0: Frequent Visitors, 1: Premium Customers, 2: Family Visitors, 3: Coupon Grabbers
  const assignedRaw = new Set<number>();
  const rawToCanonical = new Map<number, number>();

  // 1) Highest avg spend per visit -> Premium Customers (1)
  const premium = [...groups].sort((a, b) => b.avgSpendPerVisit - a.avgSpendPerVisit)[0];
  rawToCanonical.set(premium.rawId, 1);
  assignedRaw.add(premium.rawId);

  // 2) Highest group size + children among remaining -> Family Visitors (2)
  const family = [...groups]
    .filter((g) => !assignedRaw.has(g.rawId))
    .sort((a, b) => (b.avgGroupSize + b.avgChildren * 0.6) - (a.avgGroupSize + a.avgChildren * 0.6))[0];
  if (family) {
    rawToCanonical.set(family.rawId, 2);
    assignedRaw.add(family.rawId);
  }

  // 3) Highest discount rate among remaining -> Coupon Grabbers (3)
  const coupon = [...groups]
    .filter((g) => !assignedRaw.has(g.rawId))
    .sort((a, b) => b.avgDiscountRate - a.avgDiscountRate)[0];
  if (coupon) {
    rawToCanonical.set(coupon.rawId, 3);
    assignedRaw.add(coupon.rawId);
  }

  // 4) Remaining -> Frequent Visitors (0)
  for (const g of groups) {
    if (!assignedRaw.has(g.rawId)) {
      rawToCanonical.set(g.rawId, 0);
      assignedRaw.add(g.rawId);
    }
  }

  const canonicalRemap = new Array<number>(k).fill(0);
  rawToCanonical.forEach((canon, raw) => {
    canonicalRemap[canon] = raw;
  });

  const canonicalLabels = rawLabels.map((r) => rawToCanonical.get(r) ?? 0);

  const labelMap: Record<number, { name: string; subtitle: string }> = {
    0: {
      name: 'Frequent Visitors',
      subtitle: 'Regular diners with strong repeat-visit loyalty',
    },
    1: {
      name: 'Premium Customers',
      subtitle: 'High-spending guests who appreciate curated dining',
    },
    2: {
      name: 'Family Visitors',
      subtitle: 'Family groups & weekend celebration diners',
    },
    3: {
      name: 'Coupon Grabbers',
      subtitle: 'Discount-responsive guests who love combo savings',
    },
  };

  return { canonicalLabels, canonicalRemap, labelMap };
}

export function trainKMeansModel(customers: CustomerRecord[], nClusters = 4): {
  model: KMeansModelArtifact;
  assignedCustomers: CustomerRecord[];
} {
  if (customers.length < nClusters) {
    throw new Error(`Need at least ${nClusters} customers to train ${nClusters}-cluster K-Means.`);
  }

  const ages = customers.map((c) => c.age).filter((a): a is number => a !== null && a > 0);
  const medianAge = ages.length > 0 ? ages.sort((a, b) => a - b)[Math.floor(ages.length / 2)] : 32;

  const rawMatrix = customers.map((c) => extractFeatureVector(c, medianAge));
  const dims = KMEANS_FEATURE_COLUMNS.length;
  const means = new Array<number>(dims).fill(0);
  const stds = new Array<number>(dims).fill(1);

  for (let d = 0; d < dims; d++) {
    const col = rawMatrix.map((row) => row[d]);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    const variance = col.reduce((a, b) => a + (b - mean) ** 2, 0) / col.length;
    means[d] = mean;
    stds[d] = Math.sqrt(variance) || 1;
  }

  const XScaled = rawMatrix.map((row) => row.map((v, d) => (v - means[d]) / stds[d]));

  const elbowInertias: Record<string, number> = {};
  for (let k = 2; k <= Math.min(6, customers.length - 1); k++) {
    const evalRes = runKMeansCore(XScaled, k);
    elbowInertias[String(k)] = Number(evalRes.inertia.toFixed(2));
  }

  const trained = runKMeansCore(XScaled, nClusters);
  const silhouette = computeSilhouette(XScaled, trained.labels, nClusters);
  const { canonicalLabels, canonicalRemap, labelMap } = assignBusinessClusterNames(
    customers,
    trained.labels,
    nClusters
  );

  // Reorder centroids to canonical cluster IDs (0..3)
  const orderedCentroids = canonicalRemap.map((rawIdx) => trained.centroids[rawIdx]);

  const now = new Date();
  const model: KMeansModelArtifact = {
    model_version: `km_${now.toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`,
    trained_at: now.toISOString(),
    n_clusters: nClusters,
    feature_columns: KMEANS_FEATURE_COLUMNS,
    means,
    stds,
    centroids: orderedCentroids,
    cluster_label_map: labelMap,
    silhouette_score: silhouette,
    inertia: Number(trained.inertia.toFixed(2)),
    elbow_inertias: elbowInertias,
    training_sample_count: customers.length,
  };

  const assignedCustomers = customers.map((c, idx) => {
    const cid = canonicalLabels[idx];
    return {
      ...c,
      cluster_id: cid,
      cluster_name: labelMap[cid]?.name || `Cluster ${cid}`,
    };
  });

  return { model, assignedCustomers };
}

/**
 * Predicts cluster for a single customer using the SAVED scaler & centroids.
 * Does NOT retrain K-Means on incoming orders.
 */
export function predictCustomerCluster(
  customer: CustomerRecord,
  model: KMeansModelArtifact
): { cluster_id: number; cluster_name: string } {
  const vec = extractFeatureVector(customer, model.means[0] || 32);
  const scaled = vec.map((v, d) => (v - (model.means[d] ?? 0)) / (model.stds[d] || 1));

  let bestCid = 0;
  let bestDist = Infinity;
  for (let cid = 0; cid < model.centroids.length; cid++) {
    const d = sqDist(scaled, model.centroids[cid]);
    if (d < bestDist) {
      bestDist = d;
      bestCid = cid;
    }
  }
  return {
    cluster_id: bestCid,
    cluster_name: model.cluster_label_map[bestCid]?.name || `Cluster ${bestCid}`,
  };
}

export function buildClusterProfiles(
  customers: CustomerRecord[],
  model: KMeansModelArtifact
): ClusterProfile[] {
  const totalCustomers = Math.max(1, customers.length);
  const overallAvgSpend =
    customers.reduce((s, c) => s + c.avg_spend_per_visit_inr, 0) / totalCustomers;
  const overallAvgVisits =
    customers.reduce((s, c) => s + c.total_visits, 0) / totalCustomers;

  const profiles: ClusterProfile[] = [];

  for (let cid = 0; cid < model.n_clusters; cid++) {
    const list = customers.filter((c) => c.cluster_id === cid);
    const n = Math.max(1, list.length);
    const meta = model.cluster_label_map[cid] || {
      name: `Cluster ${cid}`,
      subtitle: 'Behavioral customer segment',
    };

    const totalRev = list.reduce((s, c) => s + c.total_spend_inr, 0);
    const avgTotalSpend = totalRev / n;
    const avgSpendPerVisit = list.reduce((s, c) => s + c.avg_spend_per_visit_inr, 0) / n;
    const avgVisits = list.reduce((s, c) => s + c.total_visits, 0) / n;
    const avgGroupSize = list.reduce((s, c) => s + c.avg_group_size, 0) / n;
    const avgChildren = list.reduce((s, c) => s + c.total_children, 0) / n;
    const ratedGuests = list.filter((c) => c.avg_rating_given !== null && Number.isFinite(c.avg_rating_given));
    const avgRating =
      ratedGuests.length > 0
        ? ratedGuests.reduce((s, c) => s + (c.avg_rating_given ?? 0), 0) / ratedGuests.length
        : 4.2;
    const discountUsagePct = (list.reduce((s, c) => s + c.discount_rate, 0) / n) * 100;
    const highAlertsCount = list.filter((c) => c.churn_alert_flag === 'HIGH_PRIORITY_ALERT').length;
    const alertPct = (highAlertsCount / n) * 100;

    // Mode calculations from actual cluster members
    const catTotals: Record<string, number> = {
      Chicken: list.reduce((s, c) => s + c.chicken_orders, 0),
      Veg: list.reduce((s, c) => s + c.veg_orders, 0),
      Mutton: list.reduce((s, c) => s + c.mutton_orders, 0),
      Seafood: list.reduce((s, c) => s + c.seafood_orders, 0),
      'Biryani & Rice': list.reduce((s, c) => s + c.biryani_rice_orders, 0),
      'Chinese & Fast Food': list.reduce((s, c) => s + c.chinese_fastfood_orders, 0),
      'Dessert & Beverage': list.reduce((s, c) => s + c.dessert_beverage_orders, 0),
    };
    const topFoodCat =
      Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Chicken';

    const mealFreq: Record<string, number> = {};
    const dayFreq: Record<string, number> = {};
    for (const c of list) {
      mealFreq[c.preferred_meal_time] = (mealFreq[c.preferred_meal_time] || 0) + 1;
      dayFreq[c.preferred_day_type] = (dayFreq[c.preferred_day_type] || 0) + 1;
    }
    const prefMeal = Object.entries(mealFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Dinner';
    const prefDay = Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Weekend';

    const retentionRisk =
      alertPct >= 30
        ? `Elevated (${highAlertsCount} overdue guests / ${alertPct.toFixed(0)}%)`
        : alertPct >= 15
        ? `Moderate (${highAlertsCount} overdue guests / ${alertPct.toFixed(0)}%)`
        : `Low (${highAlertsCount} overdue guests / ${alertPct.toFixed(0)}%)`;

    const insights: string[] = [
      `Contributes ₹${Math.round(totalRev).toLocaleString('en-IN')} across ${list.length} guests (${((list.length / totalCustomers) * 100).toFixed(1)}% of customer base).`,
      `Average bill is ₹${Math.round(avgSpendPerVisit).toLocaleString('en-IN')} per visit (${avgSpendPerVisit >= overallAvgSpend ? 'above' : 'below'} restaurant avg of ₹${Math.round(overallAvgSpend).toLocaleString('en-IN')}) with ${avgVisits.toFixed(1)} visits/guest.`,
      `Primary preference is ${topFoodCat} during ${prefMeal} on ${prefDay}s, with ${discountUsagePct.toFixed(0)}% coupon utilization and ${avgRating.toFixed(2)}/5 rating.`,
    ];

    const recommendations: string[] = [];
    if (cid === 1) {
      recommendations.push(
        `Reserve priority ${prefDay} ${prefMeal} tables and offer personal chef hospitality around ${topFoodCat}.`,
        'Avoid promotional coupons or discount codes; maintain refined VIP care and warm personal greetings.'
      );
    } else {
      if (avgSpendPerVisit >= overallAvgSpend * 1.15) {
        recommendations.push(
          `Offer priority weekend ${prefMeal} reservations and signature tasting platters around ${topFoodCat}.`,
          'Focus on hospitality perks and special celebrations rather than heavy discounting.'
        );
      }
      if (avgGroupSize >= 3.2 || avgChildren >= 0.8) {
        recommendations.push(
          `Promote family-friendly ${topFoodCat} group platters and kids' complimentary dessert bundles on ${prefDay}s.`,
          'Highlight comfortable multi-seat dining options in SMS campaigns.'
        );
      }
      if (discountUsagePct >= 35) {
        recommendations.push(
          'Share flat-amount or weekday-saver SMS coupons to encourage visits during quieter hours.',
          'Track repeat visit conversion after coupon redemption before expanding discount size.'
        );
      }
      if (avgVisits >= overallAvgVisits) {
        recommendations.push(
          'Reward loyal guests with 2X points or complimentary starter treats on milestone visits.',
          `Reach out promptly to the ${highAlertsCount} guests who have not visited recently.`
        );
      }
      if (recommendations.length < 2) {
        recommendations.push(
          `Send personalized ${topFoodCat} dish reminders timed before ${prefDay} ${prefMeal} hours.`,
          `Welcome back ${highAlertsCount} overdue guests using favourite-dish SMS greetings.`
        );
      }
    }

    profiles.push({
      cluster_id: cid,
      cluster_name: meta.name,
      subtitle: meta.subtitle,
      customer_count: list.length,
      customer_share_pct: Number(((list.length / totalCustomers) * 100).toFixed(1)),
      total_revenue_inr: Math.round(totalRev),
      avg_total_spend_inr: Math.round(avgTotalSpend),
      avg_spend_per_visit_inr: Math.round(avgSpendPerVisit),
      avg_visits: Number(avgVisits.toFixed(1)),
      avg_group_size: Number(avgGroupSize.toFixed(1)),
      avg_children: Number(avgChildren.toFixed(2)),
      avg_rating: Number(avgRating.toFixed(2)),
      discount_usage_pct: Math.round(discountUsagePct),
      high_alerts_count: highAlertsCount,
      top_food_category: topFoodCat,
      preferred_meal_time: prefMeal,
      preferred_day_type: prefDay,
      retention_risk: retentionRisk,
      business_insights: insights,
      recommendations: recommendations.slice(0, 3),
    });
  }

  return profiles;
}
