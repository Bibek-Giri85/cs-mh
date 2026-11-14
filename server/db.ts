import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  buildClusterProfiles,
  predictCustomerCluster,
  trainKMeansModel,
} from './kmeans.ts';
import { buildBirthdayList } from './birthday.ts';
import {
  createSeedData,
  deriveCustomerFields,
  getDatasetReferenceDate,
  normalizeDateToYMD,
  parseCustomersCsv,
  resolveDatasetCsvPath,
} from './seed.ts';
import type {
  BirthdayOffer,
  CampaignRecipient,
  CampaignRecord,
  CustomerRecord,
  DatabaseState,
  MlPipelineRun,
  OrderRecord,
  ProcessingLog,
} from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'mothers_hut_db.json');

export const ML_BATCH_THRESHOLD_MIN = 10;
export const ML_BATCH_THRESHOLD_MAX = 15;

let dbCache: DatabaseState | null = null;

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function generateNextCustomerId(db: DatabaseState): string {
  const existingIds = new Set<string>();
  let maxNum = 1000 + db.customers.length + (db.pending_ml_queue?.length || 0);
  for (const c of db.customers) {
    existingIds.add(c.customer_id);
    const m = /^CUST_(\d+)$/i.exec(c.customer_id);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }
  for (const q of db.pending_ml_queue || []) {
    existingIds.add(q.customer_id);
    const m = /^CUST_(\d+)$/i.exec(q.customer_id);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }
  let candidateNum = maxNum + 1;
  while (existingIds.has(`CUST_${candidateNum}`)) {
    candidateNum++;
  }
  return `CUST_${candidateNum}`;
}

function cleanCustomerRecord(c: CustomerRecord, medianAge: number, refDate: Date): CustomerRecord {
  const digits = String(c.contact_no || '').replace(/\D/g, '');
  const cleanPhone = digits.length >= 10 ? digits.slice(-10) : digits;
  const cleanName = String(c.customer_name || 'Guest').replace(/\s+/g, ' ').trim() || 'Guest';
  const cleanAge =
    c.age !== null && c.age !== undefined && Number.isFinite(Number(c.age)) && Number(c.age) > 0
      ? Math.round(Number(c.age))
      : medianAge;
  const cleanRating =
    c.avg_rating_given !== null &&
    c.avg_rating_given !== undefined &&
    Number.isFinite(Number(c.avg_rating_given))
      ? Number(Math.min(5, Math.max(1, Number(c.avg_rating_given))).toFixed(1))
      : null;

  return deriveCustomerFields(
    {
      ...c,
      customer_name: cleanName,
      contact_no: cleanPhone,
      age: cleanAge,
      dob: normalizeDateToYMD(c.dob),
      avg_rating_given: cleanRating,
      most_ordered_dish: c.most_ordered_dish ? c.most_ordered_dish.trim() : null,
    },
    refDate
  );
}

function executeMlPipelineOnState(
  state: DatabaseState,
  stagedRecords: CustomerRecord[],
  batchCount: number
): MlPipelineRun {
  const mergedMap = new Map<string, CustomerRecord>();
  for (const existing of state.customers) {
    mergedMap.set(existing.customer_id, existing);
  }
  for (const incoming of stagedRecords) {
    mergedMap.set(incoming.customer_id, incoming);
  }
  const combinedRaw = Array.from(mergedMap.values());
  const refDate = getDatasetReferenceDate(combinedRaw);
  const validAges = combinedRaw
    .map((c) => c.age)
    .filter((a): a is number => a !== null && Number.isFinite(a) && a > 0)
    .sort((a, b) => a - b);
  const medianAge = validAges.length > 0 ? validAges[Math.floor(validAges.length / 2)] : 32;
  const cleanedCustomers = combinedRaw.map((c) => cleanCustomerRecord(c, medianAge, refDate));
  const preprocessedCustomers = cleanedCustomers.map((c) => deriveCustomerFields(c, refDate));

  const { model, assignedCustomers } = trainKMeansModel(preprocessedCustomers, 4);

  state.customers = assignedCustomers;
  state.model = model;
  state.pending_ml_queue = [];
  state.pending_ml_meta = [];

  const run: MlPipelineRun = {
    run_id: model.model_version,
    executed_at: model.trained_at,
    batch_size_processed: batchCount,
    total_customers_after: assignedCustomers.length,
    silhouette_score: model.silhouette_score,
    steps: [
      {
        step: 'data_cleaning',
        title: 'Data Cleaning',
        status: 'completed',
        summary: `Validated & deduplicated ${cleanedCustomers.length} records, standardized phones/dates, imputed missing ages (median ${medianAge}).`,
      },
      {
        step: 'preprocessing',
        title: 'Preprocessing',
        status: 'completed',
        summary: `Recomputed Avg/Visit, visit gaps & Z-score scaling across ${model.feature_columns.length} normalized columns.`,
      },
      {
        step: 'feature_engineering',
        title: 'Feature Engineering',
        status: 'completed',
        summary: `Engineered 16 guest behavior features (7 food-category shares, spend intensity, discount rate & overdue ratio).`,
      },
      {
        step: 'apply_algorithm',
        title: 'Apply Algorithm',
        status: 'completed',
        summary: `Applied 12-restart K-Means++ clustering into 4 dining groups (Silhouette ${model.silhouette_score}).`,
      },
    ],
  };

  state.last_ml_pipeline_run = run;
  return run;
}

export function loadDatabase(): DatabaseState {
  if (dbCache) return dbCache;
  ensureDir();

  const fullCsvPath = resolveDatasetCsvPath();
  let expectedFullCount = 0;
  if (fullCsvPath) {
    const lineCount = fs.readFileSync(fullCsvPath, 'utf-8').split(/\r?\n/).filter(Boolean).length - 1;
    expectedFullCount = Math.max(0, lineCount);
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseState;
      const hasFullDatasetLoaded =
        Array.isArray(parsed.customers) &&
        parsed.model &&
        (expectedFullCount <= 100 || parsed.customers.length >= 200);

      if (hasFullDatasetLoaded) {
        const refDate = getDatasetReferenceDate(parsed.customers);
        parsed.customers = parsed.customers.map((c) => deriveCustomerFields(c, refDate));
        parsed.pending_ml_queue = Array.isArray(parsed.pending_ml_queue)
          ? parsed.pending_ml_queue
          : [];
        parsed.pending_ml_meta = Array.isArray(parsed.pending_ml_meta)
          ? parsed.pending_ml_meta
          : [];
        if (!parsed.last_ml_pipeline_run) {
          parsed.last_ml_pipeline_run = {
            run_id: parsed.model.model_version,
            executed_at: parsed.model.trained_at,
            batch_size_processed: parsed.customers.length,
            total_customers_after: parsed.customers.length,
            silhouette_score: parsed.model.silhouette_score,
            steps: [
              {
                step: 'data_cleaning',
                title: 'Data Cleaning',
                status: 'completed',
                summary: `Validated ${parsed.customers.length} guest records, standardized phones & dates.`,
              },
              {
                step: 'preprocessing',
                title: 'Preprocessing',
                status: 'completed',
                summary: `Computed Avg/Visit & Z-score scaled ${parsed.model.feature_columns.length} columns.`,
              },
              {
                step: 'feature_engineering',
                title: 'Feature Engineering',
                status: 'completed',
                summary: 'Extracted 16 food-share, spend & recency features.',
              },
              {
                step: 'apply_algorithm',
                title: 'Apply Algorithm',
                status: 'completed',
                summary: `Assigned 4 dining groups via K-Means++ (Silhouette ${parsed.model.silhouette_score}).`,
              },
            ],
          };
        }
        dbCache = parsed;
        return dbCache;
      }
    } catch {
      // Fall through to fresh seed if corrupted or outdated small sample
    }
  }

  const seeded = createSeedData();
  const { model, assignedCustomers } = trainKMeansModel(seeded.customers, 4);

  const initialState: DatabaseState = {
    customers: assignedCustomers,
    orders: seeded.orders,
    birthday_offers: seeded.birthdayOffers,
    campaigns: [],
    birthday_campaigns: [],
    processing_logs: [],
    model,
    pending_ml_queue: [],
    pending_ml_meta: [],
    last_ml_pipeline_run: null,
  };

  const initialRun = executeMlPipelineOnState(initialState, [], assignedCustomers.length);
  initialState.processing_logs = [
    {
      id: crypto.randomUUID(),
      event_type: 'ML_PIPELINE_COMPLETED',
      reference_id: initialRun.run_id,
      status: 'SUCCESS',
      details: `Full dataset (${initialState.customers.length} guests) processed through Data Cleaning → Preprocessing → Feature Engineering → K-Means++.`,
      created_at: new Date().toISOString(),
    },
  ];

  dbCache = initialState;
  saveDatabase();
  return dbCache;
}

export function saveDatabase(): void {
  if (!dbCache) return;
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf-8');
}

export function addProcessingLog(
  eventType: string,
  referenceId: string,
  status: ProcessingLog['status'],
  details: string
): void {
  const db = loadDatabase();
  db.processing_logs.unshift({
    id: crypto.randomUUID(),
    event_type: eventType,
    reference_id: referenceId,
    status,
    details,
    created_at: new Date().toISOString(),
  });
  if (db.processing_logs.length > 200) {
    db.processing_logs = db.processing_logs.slice(0, 200);
  }
  saveDatabase();
}

export function resetCampaignOperations(): void {
  const db = loadDatabase();
  db.campaigns = [];
  db.birthday_campaigns = [];
  db.processing_logs = [];
  saveDatabase();
}

export function getDashboardSnapshot() {
  const db = loadDatabase();
  const refDate = getDatasetReferenceDate(db.customers);
  const customers = db.customers.map((c) => deriveCustomerFields(c, refDate));
  db.customers = customers;

  const profiles = buildClusterProfiles(customers, db.model);
  const birthdays = buildBirthdayList(
    customers,
    db.birthday_offers,
    db.birthday_campaigns,
    refDate
  );
  const birthdaysUnder7d = birthdays.filter((b) => b.days_remaining >= 0 && b.days_remaining <= 7);
  const urgentBirthdays = birthdays.filter((b) => b.days_remaining >= 0 && b.days_remaining <= 4);

  const totalRevenue = customers.reduce((s, c) => s + c.total_spend_inr, 0);
  const totalOrders = customers.reduce((s, c) => s + c.total_visits, 0);
  const avgSpend = customers.length > 0 ? Math.round(totalRevenue / customers.length) : 0;
  const avgVisits = customers.length > 0 ? Number((totalOrders / customers.length).toFixed(1)) : 0;
  const activeCustomers = customers.filter((c) => c.days_since_last_visit <= 35).length;

  const foodTotals = [
    { category: 'Chicken', count: customers.reduce((s, c) => s + c.chicken_orders, 0) },
    { category: 'Biryani & Rice', count: customers.reduce((s, c) => s + c.biryani_rice_orders, 0) },
    { category: 'Veg', count: customers.reduce((s, c) => s + c.veg_orders, 0) },
    { category: 'Mutton', count: customers.reduce((s, c) => s + c.mutton_orders, 0) },
    { category: 'Chinese & Fast Food', count: customers.reduce((s, c) => s + c.chinese_fastfood_orders, 0) },
    { category: 'Dessert & Beverage', count: customers.reduce((s, c) => s + c.dessert_beverage_orders, 0) },
    { category: 'Seafood', count: customers.reduce((s, c) => s + c.seafood_orders, 0) },
  ].sort((a, b) => b.count - a.count);

  const contactedIds = new Set<string>();
  for (const camp of db.campaigns) {
    if (camp.campaign_type === 'alert' || camp.campaign_type === 'bulk_alert') {
      for (const r of camp.recipients) {
        if (r.delivery_status !== 'Failed') {
          contactedIds.add(r.customer_id);
        }
      }
    }
  }

  const pendingMeta = db.pending_ml_meta || [];

  return {
    metrics: {
      total_customers: customers.length,
      active_customers: activeCustomers,
      total_orders: totalOrders,
      total_revenue_inr: Math.round(totalRevenue),
      avg_customer_spend_inr: avgSpend,
      avg_visits_per_customer: avgVisits,
      cluster_count: profiles.length,
      upcoming_birthdays_7d: birthdaysUnder7d.length,
      upcoming_birthdays_30d: birthdays.filter((b) => b.days_remaining <= 30).length,
      urgent_birthdays_4d: urgentBirthdays.length,
      high_alerts_remaining: customers.filter(
        (c) => c.churn_alert_flag === 'HIGH_PRIORITY_ALERT' && !contactedIds.has(c.customer_id)
      ).length,
      total_campaigns: db.campaigns.length,
      total_sms_sent: db.campaigns.reduce((s, c) => s + c.sent_count, 0),
      total_sms_delivered: db.campaigns.reduce((s, c) => s + c.delivered_count, 0),
      total_sms_failed: db.campaigns.reduce((s, c) => s + c.failed_count, 0),
    },
    customers,
    cluster_profiles: profiles,
    birthdays,
    urgent_birthdays: birthdaysUnder7d,
    birthday_offers: db.birthday_offers,
    campaigns: db.campaigns,
    orders: db.orders,
    processing_logs: db.processing_logs,
    food_distribution: foodTotals,
    ml_pipeline: {
      batch_threshold_min: ML_BATCH_THRESHOLD_MIN,
      batch_threshold_max: ML_BATCH_THRESHOLD_MAX,
      queued_count: pendingMeta.length,
      queued_guests: pendingMeta,
      last_run: db.last_ml_pipeline_run || null,
    },
    model: {
      model_version: db.model.model_version,
      trained_at: db.model.trained_at,
      n_clusters: db.model.n_clusters,
      silhouette_score: db.model.silhouette_score,
      inertia: db.model.inertia,
      elbow_inertias: db.model.elbow_inertias,
      training_sample_count: db.model.training_sample_count,
      feature_columns: db.model.feature_columns,
    },
    contacted_alert_ids: Array.from(contactedIds),
  };
}

function enqueueCustomerForMlBatch(
  db: DatabaseState,
  candidate: CustomerRecord,
  action: 'new' | 'update',
  deferRun = false
): {
  customer: CustomerRecord;
  queued_for_ml_batch: boolean;
  queued_count: number;
  batch_threshold: number;
  pipeline_executed: boolean;
} {
  const queue = db.pending_ml_queue || (db.pending_ml_queue = []);
  const meta = db.pending_ml_meta || (db.pending_ml_meta = []);

  const pred = predictCustomerCluster(candidate, db.model);
  candidate.cluster_id = pred.cluster_id;
  candidate.cluster_name = pred.cluster_name;

  const existingIdx = db.customers.findIndex((c) => c.customer_id === candidate.customer_id);
  if (existingIdx >= 0) {
    db.customers[existingIdx] = candidate;
  }

  const qIdx = queue.findIndex(
    (q) => q.customer_id === candidate.customer_id || q.contact_no === candidate.contact_no
  );
  if (qIdx >= 0) {
    queue[qIdx] = candidate;
    meta[qIdx] = {
      customer_id: candidate.customer_id,
      customer_name: candidate.customer_name,
      action,
      queued_at: new Date().toISOString(),
    };
  } else {
    queue.push(candidate);
    meta.push({
      customer_id: candidate.customer_id,
      customer_name: candidate.customer_name,
      action,
      queued_at: new Date().toISOString(),
    });
  }

  if (!deferRun && queue.length >= ML_BATCH_THRESHOLD_MIN) {
    const batchCount = queue.length;
    const run = executeMlPipelineOnState(db, queue, batchCount);
    const committed =
      db.customers.find((c) => c.customer_id === candidate.customer_id) || candidate;
    saveDatabase();
    addProcessingLog(
      'ML_PIPELINE_COMPLETED',
      run.run_id,
      'SUCCESS',
      `Batch of ${batchCount} guests passed Data Cleaning → Preprocessing → Feature Engineering → K-Means++ and published to dashboard.`
    );
    return {
      customer: committed,
      queued_for_ml_batch: false,
      queued_count: 0,
      batch_threshold: ML_BATCH_THRESHOLD_MIN,
      pipeline_executed: true,
    };
  }

  saveDatabase();
  addProcessingLog(
    'ML_BATCH_QUEUED',
    candidate.customer_id,
    'SUCCESS',
    `Queued ${candidate.customer_name} (${queue.length}/${ML_BATCH_THRESHOLD_MIN} waiting for batch ML pipeline).`
  );

  return {
    customer: candidate,
    queued_for_ml_batch: true,
    queued_count: queue.length,
    batch_threshold: ML_BATCH_THRESHOLD_MIN,
    pipeline_executed: false,
  };
}

export function importCustomersFromCsv(
  csvText: string,
  mode: 'replace' | 'merge' = 'replace'
): { imported_count: number; total_customers: number } {
  const db = loadDatabase();
  const parsed = parseCustomersCsv(csvText);
  if (parsed.length === 0) {
    throw new Error('No valid customer records found in the uploaded CSV.');
  }

  if (mode === 'replace') {
    db.customers = [];
  }

  const run = executeMlPipelineOnState(db, parsed, parsed.length);
  saveDatabase();
  addProcessingLog(
    'CSV_IMPORTED',
    run.run_id,
    'SUCCESS',
    `Processed ${parsed.length} guest records through ML pipeline — dashboard now shows ${db.customers.length} guests.`
  );
  return { imported_count: parsed.length, total_customers: db.customers.length };
}

export function upsertCustomer(
  input: {
    customer_id?: string;
    customer_name: string;
    contact_no: string;
    age?: number | null;
    dob?: string | null;
    gender?: string;
    first_visit_date?: string;
    last_visit_date?: string;
    total_visits?: number;
    total_spend_inr?: number;
    avg_group_size?: number;
    total_children?: number;
    discount_used_count?: number;
    chicken_orders?: number;
    veg_orders?: number;
    mutton_orders?: number;
    seafood_orders?: number;
    biryani_rice_orders?: number;
    chinese_fastfood_orders?: number;
    dessert_beverage_orders?: number;
    most_ordered_dish?: string | null;
    preferred_day_type?: string;
    preferred_meal_time?: string;
    avg_rating_given?: number | null;
    area?: string;
    loyalty_member?: string;
    preferred_order_channel?: string;
  },
  deferRun = false
): {
  customer: CustomerRecord;
  queued_for_ml_batch: boolean;
  queued_count: number;
  batch_threshold: number;
  pipeline_executed: boolean;
} {
  const db = loadDatabase();
  const digits = String(input.contact_no || '').replace(/\D/g, '');
  if (digits.length < 10) {
    throw new Error('Phone number must contain at least 10 digits.');
  }
  const cleanPhone = digits.slice(-10);

  const refDate = getDatasetReferenceDate(db.customers);
  const todayStr = refDate.toISOString().slice(0, 10);
  const queue = db.pending_ml_queue || [];
  const queuedMatch = input.customer_id
    ? queue.find((c) => c.customer_id === input.customer_id)
    : queue.find((c) => c.contact_no === cleanPhone);
  const existingMatch = input.customer_id
    ? db.customers.find((c) => c.customer_id === input.customer_id)
    : db.customers.find((c) => c.contact_no === cleanPhone);

  const existing = queuedMatch || existingMatch || null;
  const cid = existing
    ? existing.customer_id
    : input.customer_id?.trim() || generateNextCustomerId(db);

  const totalVisits = Math.max(1, Number(input.total_visits ?? existing?.total_visits ?? 1));
  const totalSpend = Math.max(0, Number(input.total_spend_inr ?? existing?.total_spend_inr ?? 0));
  const avgSpend = Number((totalSpend / totalVisits).toFixed(2));

  const merged = deriveCustomerFields(
    {
      customer_id: cid,
      customer_name: input.customer_name.trim(),
      contact_no: cleanPhone,
      age: input.age !== undefined ? input.age : existing?.age ?? null,
      dob: input.dob !== undefined ? normalizeDateToYMD(input.dob) : existing?.dob ?? null,
      gender: input.gender || existing?.gender || 'Prefer not to say',
      first_visit_date:
        normalizeDateToYMD(input.first_visit_date) || existing?.first_visit_date || todayStr,
      last_visit_date:
        normalizeDateToYMD(input.last_visit_date) || existing?.last_visit_date || todayStr,
      total_visits: totalVisits,
      total_spend_inr: totalSpend,
      avg_spend_per_visit_inr: avgSpend,
      avg_group_size: Number(input.avg_group_size ?? existing?.avg_group_size ?? 2),
      total_children: Number(input.total_children ?? existing?.total_children ?? 0),
      discount_used_count: Number(input.discount_used_count ?? existing?.discount_used_count ?? 0),
      chicken_orders: Number(input.chicken_orders ?? existing?.chicken_orders ?? 0),
      veg_orders: Number(input.veg_orders ?? existing?.veg_orders ?? 0),
      mutton_orders: Number(input.mutton_orders ?? existing?.mutton_orders ?? 0),
      seafood_orders: Number(input.seafood_orders ?? existing?.seafood_orders ?? 0),
      biryani_rice_orders: Number(input.biryani_rice_orders ?? existing?.biryani_rice_orders ?? 0),
      chinese_fastfood_orders: Number(
        input.chinese_fastfood_orders ?? existing?.chinese_fastfood_orders ?? 0
      ),
      dessert_beverage_orders: Number(
        input.dessert_beverage_orders ?? existing?.dessert_beverage_orders ?? 0
      ),
      most_ordered_dish:
        input.most_ordered_dish !== undefined
          ? input.most_ordered_dish
          : existing?.most_ordered_dish ?? null,
      preferred_day_type: input.preferred_day_type || existing?.preferred_day_type || 'Weekend',
      preferred_meal_time: input.preferred_meal_time || existing?.preferred_meal_time || 'Dinner',
      avg_rating_given:
        input.avg_rating_given !== undefined
          ? input.avg_rating_given
          : existing?.avg_rating_given ?? null,
      area: input.area || existing?.area || 'Kolkata',
      loyalty_member: input.loyalty_member || existing?.loyalty_member || 'No',
      preferred_order_channel:
        input.preferred_order_channel || existing?.preferred_order_channel || 'Dine-In',
    },
    refDate
  );

  return enqueueCustomerForMlBatch(db, merged, existingMatch ? 'update' : 'new', deferRun);
}

export function processBatchCustomers(items: Array<Record<string, unknown>>): {
  received_count: number;
  queued_count: number;
  batch_threshold: number;
  pipeline_executed: boolean;
  pipeline_run: MlPipelineRun | null;
} {
  const db = loadDatabase();
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Batch payload must be a non-empty array of guest records.');
  }

  let lastMeta = {
    queued_count: (db.pending_ml_queue || []).length,
    pipeline_executed: false,
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const defer = !isLast;
    const res = upsertCustomer(item as Parameters<typeof upsertCustomer>[0], defer);
    lastMeta = { queued_count: res.queued_count, pipeline_executed: res.pipeline_executed };
  }

  return {
    received_count: items.length,
    queued_count: lastMeta.queued_count,
    batch_threshold: ML_BATCH_THRESHOLD_MIN,
    pipeline_executed: lastMeta.pipeline_executed,
    pipeline_run: lastMeta.pipeline_executed ? db.last_ml_pipeline_run || null : null,
  };
}

export function retrainModelControlled(): {
  model: DatabaseState['model'];
  reassigned_count: number;
  pipeline_run: MlPipelineRun;
} {
  const db = loadDatabase();
  const previousModel = db.model;
  const previousCustomers = db.customers;

  try {
    const queue = db.pending_ml_queue || [];
    const batchCount = queue.length > 0 ? queue.length : db.customers.length;
    const run = executeMlPipelineOnState(db, queue, batchCount);
    saveDatabase();
    addProcessingLog(
      'ML_PIPELINE_COMPLETED',
      run.run_id,
      'SUCCESS',
      `ML Pipeline ran across ${db.customers.length} guests (Data Cleaning → Preprocessing → Feature Engineering → K-Means++).`
    );
    return { model: db.model, reassigned_count: db.customers.length, pipeline_run: run };
  } catch (err) {
    db.model = previousModel;
    db.customers = previousCustomers;
    saveDatabase();
    addProcessingLog(
      'ML_PIPELINE_COMPLETED',
      previousModel.model_version,
      'FAILED',
      `Pipeline failed, preserved previous grouping: ${(err as Error).message}`
    );
    throw err;
  }
}

function buildAlertMessageForGuest(c: CustomerRecord): string {
  const dish = c.most_ordered_dish && c.most_ordered_dish.trim() ? c.most_ordered_dish.trim() : "Chef's Special";
  const meal = (c.preferred_meal_time || 'Dinner').replace(/_/g, ' ');
  const prefix = `Greetings from Mother's Hut!\nHi ${c.customer_name}, `;

  if (c.cluster_id === 1) {
    return `${prefix}We have missed hosting you. Your preferred ${meal} table and favourite ${dish} await you whenever you visit next. For reservations, reach us at 7894561233.`;
  }
  if (c.cluster_id === 2) {
    return `${prefix}We've missed seeing you and your family! Use coupon code MHFAM20 on your next ${meal} for 20% OFF our Family ${c.top_food_category} Feast & complimentary kids' treats with ${dish}. Helpline: 7894561233.`;
  }
  if (c.cluster_id === 3) {
    return `${prefix}We've missed seeing you! Apply coupon code MHBACK100 for Flat ₹100 OFF on your favourite ${dish} & ${c.top_food_category} combo during your next ${meal}. Helpline: 7894561233.`;
  }
  return `${prefix}We've missed hosting you! Enjoy your favourite ${dish} (${c.top_food_category} Combo) with 20% OFF using coupon code MHMISS20 on your next ${meal}. For any query, call 7894561233.`;
}

export function sendSmsCampaign(input: {
  campaign_name: string;
  campaign_type: 'cluster' | 'birthday' | 'bulk_birthday' | 'alert' | 'bulk_alert';
  cluster_id?: number | null;
  cluster_name?: string | null;
  message_content: string;
  language?: 'en' | 'bn';
  recipient_ids: string[];
  birthday_occurrence?: string | null;
  birthday_option_id?: 1 | 2;
  offer_id?: string | null;
  allow_resend?: boolean;
}): CampaignRecord {
  const db = loadDatabase();
  if (!input.recipient_ids || input.recipient_ids.length === 0) {
    throw new Error('At least one recipient must be selected.');
  }

  if (input.campaign_type === 'birthday' && input.birthday_occurrence && !input.allow_resend) {
    for (const cid of input.recipient_ids) {
      const duplicate = db.birthday_campaigns.find(
        (b) => b.customer_id === cid && b.birthday_occurrence === input.birthday_occurrence
      );
      if (duplicate) {
        const cust = db.customers.find((c) => c.customer_id === cid);
        throw new Error(
          `DUPLICATE_BIRTHDAY_BLOCKED: Birthday SMS already sent to ${cust?.customer_name || cid} for ${input.birthday_occurrence}. Authorize resend explicitly to send again.`
        );
      }
    }
  }

  const targetCustomers = db.customers.filter((c) => input.recipient_ids.includes(c.customer_id));
  if (targetCustomers.length === 0) {
    throw new Error('No matching customers found for the selected recipients.');
  }

  const refDate = getDatasetReferenceDate(db.customers);
  const birthdayByCust = new Map<string, ReturnType<typeof buildBirthdayList>[number]>();
  if (input.campaign_type === 'bulk_birthday') {
    const bdayList = buildBirthdayList(
      db.customers,
      db.birthday_offers,
      db.birthday_campaigns,
      refDate
    );
    for (const entry of bdayList) {
      birthdayByCust.set(entry.customer.customer_id, entry);
    }
  }

  const campaignId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  let deliveredCount = 0;
  let failedCount = 0;

  const recipients: CampaignRecipient[] = targetCustomers.map((c, idx) => {
    const charCode = c.customer_id.charCodeAt(c.customer_id.length - 1) || 0;
    const isFailed = targetCustomers.length > 1 ? (idx + charCode) % 20 === 19 : false;
    const deliveryStatus = isFailed ? 'Failed' : 'Delivered';
    if (isFailed) failedCount++;
    else deliveredCount++;

    let personalizedMsg = '';
    if (input.campaign_type === 'bulk_alert') {
      personalizedMsg = buildAlertMessageForGuest(c);
    } else if (input.campaign_type === 'bulk_birthday') {
      const bInfo = birthdayByCust.get(c.customer_id);
      const optIdx = input.birthday_option_id === 2 ? 1 : 0;
      personalizedMsg =
        bInfo?.sms_options[optIdx]?.message ||
        `Greetings from Mother's Hut!\nHi ${c.customer_name}, Wishing you a very Happy Birthday in advance!`;
    } else {
      personalizedMsg = input.message_content
        .replaceAll('{customer_name}', c.customer_name)
        .replaceAll('{name}', c.customer_name)
        .replaceAll('{customer_id}', c.customer_id)
        .replaceAll('{total_visits}', String(c.total_visits))
        .replaceAll('{most_ordered_dish}', c.most_ordered_dish || 'our signature dishes')
        .replaceAll('{fav_dish}', c.most_ordered_dish || 'our signature dishes')
        .replaceAll('{top_food_category}', c.top_food_category)
        .replaceAll('{preferred_order_channel}', c.preferred_order_channel)
        .replaceAll('{preferred_meal_time}', c.preferred_meal_time)
        .replaceAll('{preferred_day_type}', c.preferred_day_type)
        .replaceAll('{avg_group_size}', String(c.avg_group_size))
        .replaceAll('{phone_no}', '7894561233');
    }

    return {
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      phone_no: c.contact_no,
      message_content: personalizedMsg,
      sms_status: 'Sent',
      delivery_status: deliveryStatus,
      processed_at: nowIso,
    };
  });

  const campaign: CampaignRecord = {
    id: campaignId,
    campaign_name: input.campaign_name,
    campaign_type: input.campaign_type,
    cluster_id: input.cluster_id ?? null,
    cluster_name: input.cluster_name ?? null,
    channel: 'SMS',
    message_content: input.message_content,
    language: input.language || 'en',
    recipient_count: recipients.length,
    sent_count: recipients.length,
    delivered_count: deliveredCount,
    failed_count: failedCount,
    status: 'Completed',
    created_at: nowIso,
    recipients,
  };

  db.campaigns.unshift(campaign);

  if (input.campaign_type === 'birthday' && input.birthday_occurrence) {
    for (const r of recipients) {
      const existingIdx = db.birthday_campaigns.findIndex(
        (b) => b.customer_id === r.customer_id && b.birthday_occurrence === input.birthday_occurrence
      );
      if (existingIdx >= 0) {
        db.birthday_campaigns[existingIdx] = {
          ...db.birthday_campaigns[existingIdx],
          campaign_id: campaignId,
          offer_id: input.offer_id ?? null,
          sms_status: r.delivery_status,
          resend_authorized: Boolean(input.allow_resend),
          resend_count: db.birthday_campaigns[existingIdx].resend_count + 1,
          created_at: nowIso,
        };
      } else {
        db.birthday_campaigns.push({
          id: crypto.randomUUID(),
          customer_id: r.customer_id,
          birthday_occurrence: input.birthday_occurrence,
          campaign_id: campaignId,
          offer_id: input.offer_id ?? null,
          sms_status: r.delivery_status,
          resend_authorized: Boolean(input.allow_resend),
          resend_count: 0,
          created_at: nowIso,
        });
      }
    }
  } else if (input.campaign_type === 'bulk_birthday') {
    for (const r of recipients) {
      const bInfo = birthdayByCust.get(r.customer_id);
      const occ = bInfo?.next_birthday_date;
      if (!occ) continue;
      const optIdx = input.birthday_option_id === 2 ? 1 : 0;
      const offerId = bInfo?.sms_options[optIdx]?.uses_offer_id ?? null;

      const existingIdx = db.birthday_campaigns.findIndex(
        (b) => b.customer_id === r.customer_id && b.birthday_occurrence === occ
      );
      if (existingIdx >= 0) {
        db.birthday_campaigns[existingIdx] = {
          ...db.birthday_campaigns[existingIdx],
          campaign_id: campaignId,
          offer_id: offerId,
          sms_status: r.delivery_status,
          resend_authorized: true,
          resend_count: db.birthday_campaigns[existingIdx].resend_count + 1,
          created_at: nowIso,
        };
      } else {
        db.birthday_campaigns.push({
          id: crypto.randomUUID(),
          customer_id: r.customer_id,
          birthday_occurrence: occ,
          campaign_id: campaignId,
          offer_id: offerId,
          sms_status: r.delivery_status,
          resend_authorized: false,
          resend_count: 0,
          created_at: nowIso,
        });
      }
    }
  }

  saveDatabase();
  addProcessingLog(
    'SMS_CAMPAIGN',
    campaignId,
    'SUCCESS',
    `${campaign.campaign_name} (${deliveredCount} delivered, ${failedCount} failed of ${recipients.length}).`
  );

  return campaign;
}

export function upsertBirthdayOffer(
  input: Partial<BirthdayOffer> & { title: string; discount_or_benefit: string }
): BirthdayOffer {
  const db = loadDatabase();
  const nowIso = new Date().toISOString();
  const existingIdx = input.id ? db.birthday_offers.findIndex((o) => o.id === input.id) : -1;

  const offer: BirthdayOffer = {
    id: existingIdx >= 0 ? db.birthday_offers[existingIdx].id : `bday_offer_${Date.now()}`,
    title: input.title.trim(),
    description: (input.description || input.discount_or_benefit).trim(),
    applicable_item_or_category: (input.applicable_item_or_category || 'All').trim(),
    discount_or_benefit: input.discount_or_benefit.trim(),
    validity_days: Math.max(1, Number(input.validity_days ?? 7)),
    min_order_amount_inr: Math.max(0, Number(input.min_order_amount_inr ?? 0)),
    terms_and_conditions: (
      input.terms_and_conditions || 'Valid for dine-in birthday celebrations.'
    ).trim(),
    is_active: input.is_active !== undefined ? Boolean(input.is_active) : true,
    owner_approved: input.owner_approved !== undefined ? Boolean(input.owner_approved) : true,
    created_at: existingIdx >= 0 ? db.birthday_offers[existingIdx].created_at : nowIso,
    updated_at: nowIso,
  };

  if (existingIdx >= 0) {
    db.birthday_offers[existingIdx] = offer;
  } else {
    db.birthday_offers.unshift(offer);
  }
  saveDatabase();
  return offer;
}

export function deleteBirthdayOffer(offerId: string): void {
  const db = loadDatabase();
  db.birthday_offers = db.birthday_offers.filter((o) => o.id !== offerId);
  saveDatabase();
}