
import { useEffect, useMemo, useState } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Crown, Lightbulb, Sparkles } from 'lucide-react';
import type { CustomerRecord } from '../types';
import { formatINR, formatPhone, getInitials, getRealisticOffer } from '../utils/formatters';
import {
  buildPlainEnglishReason,
  buildRadarComparisonData,
  buildStaffHospitalityTip,
  buildStatComparisons,
  CLUSTER_COLORS,
  computeGuestClusterMatch,
  computePathToVip,
  type RadarDatum,
} from '../utils/guestInsights';
import { HighlightedMessage } from './MessageHighlighter';

interface GuestDetailModalProps {
  customer: CustomerRecord | null;
  allCustomers: CustomerRecord[];
  isSent: boolean;
  onClose: () => void;
  onSaveCustomer: (
    payload: Partial<CustomerRecord> & { customer_name: string; contact_no: string }
  ) => Promise<void>;
  onSendSimulatedSms: (payload: {
    customer: CustomerRecord;
    message: string;
    language: 'en' | 'bn';
    coupon: string | null;
  }) => void;
}

function RadarCustomTooltip({
  active,
  payload,
  clusterName,
}: {
  active?: boolean;
  payload?: Array<{ payload?: RadarDatum }>;
  clusterName: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="cluster-map-tooltip">
      <div className="text-xs font-semibold text-zinc-900 mb-1">{row.metric}</div>
      <div className="text-[11px] text-slate-600 space-y-0.5">
        <div>
          This Guest: <strong className="text-zinc-900">{row.guestRaw}</strong> ({row.guestScore}/100)
        </div>
        <div>
          {clusterName} Avg: <strong className="text-zinc-900">{row.groupRaw}</strong> ({row.groupAvgScore}/100)
        </div>
      </div>
    </div>
  );
}

export function GuestDetailModal({
  customer,
  allCustomers,
  isSent,
  onClose,
  onSaveCustomer,
  onSendSimulatedSms,
}: GuestDetailModalProps) {
  const [modalLang, setModalLang] = useState<'en' | 'bn'>('en');
  const [isEditing, setIsEditing] = useState(false);
  const [customText, setCustomText] = useState('');

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editVisits, setEditVisits] = useState('1');
  const [editTotalSpend, setEditTotalSpend] = useState('0');
  const [editDish, setEditDish] = useState('');
  const [editRating, setEditRating] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setModalLang('en');
    setIsEditing(false);
    setCustomText('');
    setIsEditingProfile(false);
    if (customer) {
      setEditName(customer.customer_name);
      setEditPhone(customer.contact_no);
      setEditAge(customer.age !== null && customer.age !== undefined ? String(customer.age) : '');
      setEditDob(customer.dob || '');
      setEditVisits(String(customer.total_visits));
      setEditTotalSpend(String(customer.total_spend_inr));
      setEditDish(customer.most_ordered_dish || '');
      setEditRating(
        customer.avg_rating_given !== null && customer.avg_rating_given !== undefined
          ? String(customer.avg_rating_given)
          : ''
      );
    }
  }, [customer]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && customer) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [customer, onClose]);

  const insights = useMemo(() => {
    if (!customer) return null;
    const pool = allCustomers.length > 0 ? allCustomers : [customer];
    return {
      match: computeGuestClusterMatch(customer, pool),
      reason: buildPlainEnglishReason(customer, pool),
      comparisons: buildStatComparisons(customer, pool),
      vipPath: computePathToVip(customer, pool),
      radarData: buildRadarComparisonData(customer, pool),
      staffTip: buildStaffHospitalityTip(customer),
    };
  }, [customer, allCustomers]);

  if (!customer || !insights) return null;

  const isAlert = customer.churn_alert_flag === 'HIGH_PRIORITY_ALERT';
  const offer = getRealisticOffer(customer);
  const activeMessage = customText || (modalLang === 'bn' ? offer.messageBn : offer.messageEn);
  const clusterPalette = CLUSTER_COLORS[customer.cluster_id] || CLUSTER_COLORS[0];

  const cats = [
    { label: 'Chicken', val: customer.chicken_orders },
    { label: 'Veg', val: customer.veg_orders },
    { label: 'Mutton', val: customer.mutton_orders },
    { label: 'Seafood', val: customer.seafood_orders },
    { label: 'Biryani & Rice', val: customer.biryani_rice_orders },
    { label: 'Chinese & Fast Food', val: customer.chinese_fastfood_orders },
    { label: 'Dessert & Beverage', val: customer.dessert_beverage_orders },
  ];
  const maxVal = Math.max(...cats.map((d) => d.val), 1);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await onSaveCustomer({
        ...customer,
        customer_id: customer.customer_id,
        customer_name: editName.trim() || customer.customer_name,
        contact_no: editPhone.trim() || customer.contact_no,
        age: editAge.trim() ? Number(editAge) : null,
        dob: editDob.trim() || null,
        total_visits: Math.max(1, Number(editVisits) || 1),
        total_spend_inr: Math.max(0, Number(editTotalSpend) || 0),
        most_ordered_dish: editDish.trim() || null,
        avg_rating_given: editRating.trim() ? Number(editRating) : null,
      });
      setIsEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <button type="button" className="modal-close" aria-label="Close Profile" onClick={onClose}>
          &times;
        </button>

        {/* Header with Group Match Badge */}
        <div className="modal-header">
          <div className="modal-avatar" style={{ backgroundColor: clusterPalette.main }}>
            {getInitials(customer.customer_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="modal-title-line">
              <h2>{customer.customer_name}</h2>
              <span className={`alert-status-pill ${isSent || !isAlert ? 'sent-green' : ''}`}>
                {isSent ? '✓ SENT' : isAlert ? 'HIGH ALERT' : 'ACTIVE GUEST'}
              </span>
              <span
                className="cluster-tag-pill font-semibold"
                style={{
                  backgroundColor: clusterPalette.soft,
                  color: clusterPalette.main,
                  border: `1px solid ${clusterPalette.border}`,
                }}
              >
                {customer.cluster_name}
              </span>
              <span
                className={`group-match-badge ${
                  insights.match.isCoreMember ? 'is-core' : 'is-border'
                }`}
              >
                {insights.match.badgeText}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ padding: '3px 10px', fontSize: '0.7rem' }}
                onClick={() => setIsEditingProfile((v) => !v)}
              >
                {isEditingProfile ? 'Cancel Edit' : '✎ Edit Details'}
              </button>
            </div>
            <div className="modal-meta-line">
              <span>{customer.customer_id}</span>
              <span>•</span>
              <span className="modal-phone-text">{formatPhone(customer.contact_no)}</span>
              <span>•</span>
              <span>
                {customer.area || 'Kolkata'} • {customer.age ? `${customer.age} yrs` : 'Age N/A'} •{' '}
                {customer.gender}
              </span>
              <span>•</span>
              <span>DOB: {customer.dob || 'Not Recorded'}</span>
            </div>
          </div>
        </div>

        {/* Plain-English Reason */}
        <div className="mb-3.5 rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-zinc-800">
          <Sparkles size={15} className="shrink-0" style={{ color: clusterPalette.main }} />
          <div>
            <strong className="text-zinc-900">Why this group: </strong>
            <span>{insights.reason}</span>
          </div>
        </div>

        {isEditingProfile && (
          <form
            onSubmit={handleSaveProfile}
            className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <strong className="text-zinc-900">Update Guest Details</strong>
              <span className="text-slate-600">
                Auto Avg / Visit Preview:{' '}
                <strong className="text-zinc-900">
                  {formatINR(
                    Math.round(
                      Math.max(0, Number(editTotalSpend) || 0) /
                        Math.max(1, Number(editVisits) || 1)
                    )
                  )}
                </strong>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Name</label>
                <input
                  required
                  type="text"
                  className="field-input w-full"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Contact</label>
                <input
                  required
                  type="text"
                  className="field-input w-full"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Age</label>
                <input
                  type="number"
                  className="field-input w-full"
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">DOB</label>
                <input
                  type="date"
                  className="field-input w-full"
                  value={editDob}
                  onChange={(e) => setEditDob(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Total Visits</label>
                <input
                  type="number"
                  min={1}
                  className="field-input w-full"
                  value={editVisits}
                  onChange={(e) => setEditVisits(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Total Spend (₹)</label>
                <input
                  type="number"
                  min={0}
                  className="field-input w-full"
                  value={editTotalSpend}
                  onChange={(e) => setEditTotalSpend(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Favourite Dish</label>
                <input
                  type="text"
                  className="field-input w-full"
                  value={editDish}
                  onChange={(e) => setEditDish(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Rating (1–5)</label>
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  max={5}
                  className="field-input w-full"
                  value={editRating}
                  onChange={(e) => setEditRating(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setIsEditingProfile(false)}
              >
                Cancel
              </button>
              <button type="submit" disabled={savingProfile} className="btn btn-brand btn-sm">
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        <div className="modal-split-body">
          {/* LEFT COLUMN */}
          <div className="space-y-3">
            {/* Stats vs Restaurant Average */}
            <div className="modal-stats-grid" style={{ marginBottom: 0 }}>
              {insights.comparisons.map((item) => (
                <div key={item.key} className="stat-tile">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="tile-label">{item.label}</span>
                    <span className={`comp-pill tone-${item.pillTone}`}>{item.pillText}</span>
                  </div>
                  <strong className="tile-val">{item.formattedValue}</strong>
                  <small className="tile-sub">Rest. avg: {item.formattedAvg}</small>
                </div>
              ))}
            </div>

            {/* Path to VIP Meter */}
            <div className={`vip-meter-box ${insights.vipPath.isVip ? 'is-vip' : ''}`}>
              {insights.vipPath.isVip ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="vip-gold-badge">
                      <Crown size={13} />
                      VIP Status Secured
                    </span>
                    <span className="text-xs text-amber-900 font-medium">
                      Top-tier Premium Customer
                    </span>
                  </div>
                  <span className="text-[11px] text-amber-800">
                    Last visit: {customer.days_since_last_visit}d ago
                  </span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                    <span className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <Crown size={13} className="text-amber-600" />
                      Path to VIP
                    </span>
                    <span className="font-semibold" style={{ color: 'var(--brand-hover)' }}>
                      {insights.vipPath.labelText}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${insights.vipPath.progressPct}%`,
                        background: 'linear-gradient(90deg, #ab6446 0%, #0284c7 100%)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Me vs. My Group Radar Chart */}
            <div className="modal-sub-panel radar-panel">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 style={{ marginBottom: 0 }}>Me vs. My Group</h3>
                <span className="text-[11px] text-slate-500">Normalized (0–100)</span>
              </div>
              <div style={{ width: '100%', height: 215 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="68%" data={insights.radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fontSize: 10.5, fill: '#475569', fontWeight: 500 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      name="This Guest"
                      dataKey="guestScore"
                      stroke={clusterPalette.main}
                      fill={clusterPalette.main}
                      fillOpacity={0.3}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    <Radar
                      name={`${customer.cluster_name} Avg`}
                      dataKey="groupAvgScore"
                      stroke="#64748b"
                      fill="#94a3b8"
                      fillOpacity={0.14}
                      strokeDasharray="4 3"
                      strokeWidth={1.6}
                      isAnimationActive={false}
                    />
                    <Tooltip
                      content={<RadarCustomTooltip clusterName={customer.cluster_name} />}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 2 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Favorite Food Categories */}
            <div className="modal-sub-panel">
              <h3>Favorite Food Categories</h3>
              <div className="cat-bars-two-col">
                {cats
                  .filter((d) => d.val > 0)
                  .slice(0, 6)
                  .map((d) => (
                    <div key={d.label} className="cat-bar-item">
                      <div className="cat-bar-top">
                        <span>{d.label}</span>
                        <span>{d.val}</span>
                      </div>
                      <div className="cat-bar-track">
                        <div
                          className="cat-bar-fill"
                          style={{ width: `${Math.round((d.val / maxVal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-600 flex justify-between flex-wrap gap-2">
                <span>
                  Most Ordered Dish:{' '}
                  <strong className="text-zinc-900">
                    {customer.most_ordered_dish || 'Not recorded yet'}
                  </strong>
                </span>
                <span>
                  Last Visited: <strong className="text-zinc-900">{customer.days_since_last_visit}d ago</strong>
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Staff Tip + Recommended Offer + SMS Composer */}
          <div className="modal-right-col">
            <div className="staff-tip-box">
              <div className="flex items-start gap-2.5">
                <span className="staff-tip-icon">
                  <Lightbulb size={15} />
                </span>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    STAFF HOSPITALITY TIP
                  </span>
                  <p className="text-xs text-zinc-800 mt-0.5 leading-relaxed">
                    {insights.staffTip}
                  </p>
                </div>
              </div>
            </div>

            <div className="recommended-offer-box">
              <div className="rec-top-row">
                <span className="rec-eyebrow">
                  {customer.cluster_id === 1 ? 'VIP HOSPITALITY INVITE' : 'RECOMMENDED FOOD OFFER'}
                </span>
                {offer.coupon ? (
                  <span className="coupon-pill">CODE: {offer.coupon}</span>
                ) : (
                  <span className="coupon-pill">No Coupons (VIP)</span>
                )}
              </div>
              <h3>{offer.offerTitle}</h3>
              <p>{offer.reason}</p>
            </div>

            <div className="modal-send-panel">
              <div className="modal-send-top">
                <div>
                  <h3>Personalized SMS</h3>
                  <span className="send-to-label">
                    To: {customer.customer_name} ({formatPhone(customer.contact_no)})
                  </span>
                </div>
                <div className="lang-pill-group">
                  <button
                    type="button"
                    className={`lang-btn modal-lang-btn ${modalLang === 'en' ? 'active' : ''}`}
                    onClick={() => {
                      setModalLang('en');
                      setCustomText('');
                      setIsEditing(false);
                    }}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    className={`lang-btn modal-lang-btn ${modalLang === 'bn' ? 'active' : ''}`}
                    onClick={() => {
                      setModalLang('bn');
                      setCustomText('');
                      setIsEditing(false);
                    }}
                  >
                    বাংলা (Bengali)
                  </button>
                </div>
              </div>

              {isEditing ? (
                <textarea
                  className="custom-textarea"
                  rows={4}
                  value={activeMessage}
                  onChange={(e) => setCustomText(e.target.value)}
                />
              ) : (
                <div className="modal-message-preview">
                  <HighlightedMessage text={activeMessage} />
                </div>
              )}

              <div className="modal-send-bottom">
                <span className="sent-status-note">
                  {isSent ? '✓ SMS sent' : 'SMS Channel · Ready'}
                </span>
                <div className="modal-send-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      if (!isEditing) {
                        setCustomText(activeMessage);
                        setIsEditing(true);
                      } else {
                        setIsEditing(false);
                      }
                    }}
                  >
                    {isEditing ? '✓ Done' : '✎ Customize'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-brand"
                    onClick={() =>
                      onSendSimulatedSms({
                        customer,
                        message: activeMessage,
                        language: modalLang,
                        coupon: offer.coupon,
                      })
                    }
                  >
                    Send Personalized SMS (EN / বাংলা)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
