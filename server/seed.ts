import fs from 'node:fs';
import path from 'node:path';
import type { BirthdayOffer, CustomerRecord, OrderRecord } from './types.ts';

const CSV_CANDIDATES = [
  path.resolve(process.cwd(), 'restaurant_customers_3000_alert_ready.csv'),
  path.resolve(process.cwd(), 'public', 'assets', 'aistudio', 'restaurant_customers_3000_alert_ready_be6423cc.csv'),
  path.resolve(process.cwd(), 'data', 'customers.csv'),
];

export function resolveDatasetCsvPath(): string | null {
  for (const candidate of CSV_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Parses DD-MM-YYYY or YYYY-MM-DD safely to YYYY-MM-DD.
 */
export function normalizeDateToYMD(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return null;
}

function parseYMDLocal(dateStr: string | null | undefined, fallback: Date): Date {
  const norm = normalizeDateToYMD(dateStr);
  if (!norm) return fallback;
  const [y, m, d] = norm.split('-').map(Number);
  if (!y || !m || !d) return fallback;
  return new Date(y, m - 1, d);
}

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Computes an effective "today" date so datasets dated ahead of the local clock
 * (e.g., Nov 14, 2026) still evaluate Alerts and 7-day Birthdays accurately.
 */
export function getDatasetReferenceDate(
  records?: Array<{ last_visit_date?: string | null }>
): Date {
  const now = new Date();
  const realToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!records || records.length === 0) return realToday;

  let maxVisitTs = 0;
  for (const r of records) {
    const norm = normalizeDateToYMD(r.last_visit_date);
    if (!norm) continue;
    const [y, m, d] = norm.split('-').map(Number);
    const ts = new Date(y, m - 1, d).getTime();
    if (ts > maxVisitTs) maxVisitTs = ts;
  }

  if (maxVisitTs > 0) {
    const snapshotNextDay = new Date(maxVisitTs + 86400000);
    if (realToday.getTime() < snapshotNextDay.getTime()) {
      return snapshotNextDay;
    }
  }
  return realToday;
}

export function deriveCustomerFields(
  base: Omit<
    CustomerRecord,
    | 'first_visit_days_ago'
    | 'days_since_last_visit'
    | 'discount_rate'
    | 'spend_per_person'
    | 'expected_visit_gap'
    | 'overdue_ratio'
    | 'top_food_category'
    | 'top_food_orders'
    | 'top_food_share_pct'
    | 'cluster_id'
    | 'cluster_name'
    | 'churn_alert_flag'
  > & { cluster_id?: number; cluster_name?: string },
  refDate?: Date
): CustomerRecord {
  const now = refDate || new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstVisitNorm = normalizeDateToYMD(base.first_visit_date) || formatYMD(todayMidnight);
  const lastVisitNorm = normalizeDateToYMD(base.last_visit_date) || formatYMD(todayMidnight);
  const dobNorm = normalizeDateToYMD(base.dob);

  const firstD = parseYMDLocal(firstVisitNorm, todayMidnight);
  const lastD = parseYMDLocal(lastVisitNorm, todayMidnight);
  const msDay = 86400000;

  const firstDaysAgo = Math.max(1, Math.round((todayMidnight.getTime() - firstD.getTime()) / msDay));
  const daysSinceLast = Math.max(0, Math.round((todayMidnight.getTime() - lastD.getTime()) / msDay));
  const visits = Math.max(1, Number(base.total_visits) || 1);
  const totalSpend = Math.max(0, Number(base.total_spend_inr) || 0);
  const avgSpendPerVisit = Number((totalSpend / visits).toFixed(2));
  const avgGroupSize = Math.max(1, Number(base.avg_group_size) || 1);

  const discountRate = Number(((Number(base.discount_used_count) || 0) / visits).toFixed(3));
  const spendPerPerson = Math.round(avgSpendPerVisit / avgGroupSize);
  const expectedGap = Math.max(7, Math.round(firstDaysAgo / visits));
  const overdueRatio = Number((daysSinceLast / expectedGap).toFixed(2));

  const catCounts: Array<[string, number]> = [
    ['Chicken', Number(base.chicken_orders) || 0],
    ['Veg', Number(base.veg_orders) || 0],
    ['Mutton', Number(base.mutton_orders) || 0],
    ['Seafood', Number(base.seafood_orders) || 0],
    ['Biryani & Rice', Number(base.biryani_rice_orders) || 0],
    ['Chinese & Fast Food', Number(base.chinese_fastfood_orders) || 0],
    ['Dessert & Beverage', Number(base.dessert_beverage_orders) || 0],
  ];
  const totalCatOrders = Math.max(1, catCounts.reduce((s, [, v]) => s + v, 0));
  const topCat = catCounts.sort((a, b) => b[1] - a[1])[0];

  const churnAlertFlag =
    daysSinceLast >= 35 || overdueRatio >= 2.2 ? 'HIGH_PRIORITY_ALERT' : 'NORMAL';

  return {
    ...base,
    dob: dobNorm,
    first_visit_date: firstVisitNorm,
    last_visit_date: lastVisitNorm,
    total_visits: visits,
    total_spend_inr: Number(totalSpend.toFixed(2)),
    avg_spend_per_visit_inr: avgSpendPerVisit,
    avg_group_size: avgGroupSize,
    preferred_meal_time: (base.preferred_meal_time || 'Dinner').replace(/_/g, ' ').trim() || 'Dinner',
    preferred_day_type: (base.preferred_day_type || 'Weekend').trim() || 'Weekend',
    first_visit_days_ago: firstDaysAgo,
    days_since_last_visit: daysSinceLast,
    discount_rate: discountRate,
    spend_per_person: spendPerPerson,
    expected_visit_gap: expectedGap,
    overdue_ratio: overdueRatio,
    top_food_category: topCat[0],
    top_food_orders: topCat[1],
    top_food_share_pct: Math.round((topCat[1] / totalCatOrders) * 100),
    cluster_id: base.cluster_id ?? 0,
    cluster_name: base.cluster_name ?? 'Frequent Visitors',
    churn_alert_flag: churnAlertFlag,
  };
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(current);
      if (row.length > 1 || row[0].trim() !== '') {
        rows.push(row);
      }
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.length > 1 || row[0].trim() !== '') {
      rows.push(row);
    }
  }
  return rows;
}

export function parseCustomersCsv(csvText: string): CustomerRecord[] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const rows = parseCsvRows(cleanText);
  if (rows.length < 2) {
    throw new Error('CSV file must include a header row and at least one customer row.');
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const rawEntries: Array<Omit<
    CustomerRecord,
    | 'first_visit_days_ago'
    | 'days_since_last_visit'
    | 'discount_rate'
    | 'spend_per_person'
    | 'expected_visit_gap'
    | 'overdue_ratio'
    | 'top_food_category'
    | 'top_food_orders'
    | 'top_food_share_pct'
    | 'cluster_id'
    | 'cluster_name'
    | 'churn_alert_flag'
  >> = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const getVal = (key: string): string => {
      const idx = headers.indexOf(key);
      return idx >= 0 ? (cols[idx] ?? '').trim() : '';
    };
    const getNum = (key: string, fallback = 0): number => {
      const raw = getVal(key);
      if (raw === '') return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };

    const customerId = getVal('customer_id') || `CUST_${1000 + i}`;
    const customerName = getVal('customer_name');
    if (!customerName) continue;

    const contactDigits = getVal('contact_no').replace(/\D/g, '');
    const cleanPhone = contactDigits.length >= 10 ? contactDigits.slice(-10) : contactDigits;
    const rawAge = getVal('age');
    const parsedAge = rawAge !== '' && Number.isFinite(Number(rawAge)) ? Number(rawAge) : null;
    const rawRating = getVal('avg_rating_given');
    const parsedRating =
      rawRating !== '' && Number.isFinite(Number(rawRating))
        ? Number(Number(rawRating).toFixed(1))
        : null;

    const totalVisits = Math.max(1, getNum('total_visits', 1));
    const totalSpend = Math.max(0, getNum('total_spend_inr', 0));
    const computedAvgSpend = Number((totalSpend / totalVisits).toFixed(2));

    rawEntries.push({
      customer_id: customerId,
      customer_name: customerName,
      contact_no: cleanPhone,
      age: parsedAge,
      dob: normalizeDateToYMD(getVal('dob')),
      gender: getVal('gender') || 'Prefer not to say',
      first_visit_date: normalizeDateToYMD(getVal('first_visit_date')) || formatYMD(new Date()),
      last_visit_date: normalizeDateToYMD(getVal('last_visit_date')) || formatYMD(new Date()),
      total_visits: totalVisits,
      total_spend_inr: totalSpend,
      avg_spend_per_visit_inr: computedAvgSpend,
      avg_group_size: Math.max(1, getNum('avg_group_size', 2)),
      total_children: Math.max(0, getNum('total_children', 0)),
      discount_used_count: Math.max(0, getNum('discount_used_count', 0)),
      chicken_orders: Math.max(0, getNum('chicken_orders', 0)),
      veg_orders: Math.max(0, getNum('veg_orders', 0)),
      mutton_orders: Math.max(0, getNum('mutton_orders', 0)),
      seafood_orders: Math.max(0, getNum('seafood_orders', 0)),
      biryani_rice_orders: Math.max(0, getNum('biryani_rice_orders', 0)),
      chinese_fastfood_orders: Math.max(0, getNum('chinese_fastfood_orders', 0)),
      dessert_beverage_orders: Math.max(0, getNum('dessert_beverage_orders', 0)),
      most_ordered_dish: getVal('most_ordered_dish') || null,
      preferred_day_type: getVal('preferred_day_type') || 'Weekend',
      preferred_meal_time: (getVal('preferred_meal_time') || 'Dinner').replace(/_/g, ' '),
      avg_rating_given: parsedRating,
      area: getVal('area') || 'Kolkata',
      loyalty_member: getVal('loyalty_member') || (getNum('total_visits', 1) >= 10 ? 'Yes' : 'No'),
      preferred_order_channel: getVal('preferred_order_channel') || 'Dine-In',
    });
  }

  const refDate = getDatasetReferenceDate(rawEntries);
  const byId = new Map<string, CustomerRecord>();
  for (const entry of rawEntries) {
    const derived = deriveCustomerFields(entry, refDate);
    byId.set(derived.customer_id, derived);
  }

  return Array.from(byId.values());
}

export function createSeedData(): {
  customers: CustomerRecord[];
  orders: OrderRecord[];
  birthdayOffers: BirthdayOffer[];
} {
  let customers: CustomerRecord[] = [];
  const csvPath = resolveDatasetCsvPath();
  if (csvPath) {
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    customers = parseCustomersCsv(csvText);
  }

  const orders: OrderRecord[] = customers.slice(0, 12).map((c, idx) => ({
    order_id: `ORD_${202600 + idx + 1}`,
    customer_id: c.customer_id,
    order_date: c.last_visit_date,
    order_amount: c.avg_spend_per_visit_inr,
    group_size: Math.round(c.avg_group_size),
    children_count: c.total_children > 0 ? 1 : 0,
    discount_used: c.discount_used_count > 2,
    food_categories: c.top_food_category,
    dish_name: c.most_ordered_dish || 'House Special',
    rating: c.avg_rating_given,
    day_type: c.preferred_day_type,
    meal_time: c.preferred_meal_time,
    order_channel: c.preferred_order_channel,
    order_status: 'READY',
    processing_status: 'PROCESSED',
    source: 'dataset',
    created_at: new Date().toISOString(),
  }));

  const birthdayOffers: BirthdayOffer[] = [
    {
      id: 'bday_offer_1',
      title: 'Birthday Complimentary Dessert & 15% Celebration Treat',
      description: 'Complimentary signature dessert plus 15% off dine-in birthday celebration bills.',
      applicable_item_or_category: 'All',
      discount_or_benefit: 'a complimentary signature dessert & 15% OFF your birthday bill',
      validity_days: 7,
      min_order_amount_inr: 600,
      terms_and_conditions:
        'Valid once during birthday week on dine-in orders of ₹600 or above. Not needed for VIP hospitality guests.',
      is_active: true,
      owner_approved: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bday_offer_2',
      title: 'Biryani Birthday Family Upgrade',
      description: 'Complimentary beverage pitcher with any Biryani family order.',
      applicable_item_or_category: 'Biryani',
      discount_or_benefit: 'a complimentary mocktail pitcher with your Biryani order',
      validity_days: 5,
      min_order_amount_inr: 800,
      terms_and_conditions: 'Valid on Biryani & Rice orders above ₹800 within 5 days of birthday.',
      is_active: false,
      owner_approved: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  return { customers, orders, birthdayOffers };
}