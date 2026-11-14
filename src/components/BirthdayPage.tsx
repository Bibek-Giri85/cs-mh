import { useMemo, useState } from 'react';
import { Cake, Gift, MessageSquare, Search, Send, ShieldAlert } from 'lucide-react';
import type { BirthdayOffer, DashboardSnapshot, EnrichedBirthdayCustomer } from '../types';
import { formatINR, formatPhone } from '../utils/formatters';
import { HighlightedMessage } from './MessageHighlighter';

interface BirthdayPageProps {
  snapshot: DashboardSnapshot;
  selectedBirthdayCustomer: EnrichedBirthdayCustomer | null;
  onSelectBirthdayCustomer: (b: EnrichedBirthdayCustomer | null) => void;
  onOpenOffersModal: () => void;
  onSendBirthdaySms: (payload: {
    customer_id: string;
    customer_name: string;
    birthday_occurrence: string;
    message_content: string;
    offer_id: string | null;
    allow_resend: boolean;
  }) => void;
  onSendFilteredBirthdaySms: (payload: {
    guests: EnrichedBirthdayCustomer[];
    option_id: 1 | 2;
    filter_label: string;
  }) => void;
}

type DateRangeFilter = 'under7' | 'today' | 'tomorrow' | '2to7';
type SmsStatusFilter = 'all' | 'Not Sent' | 'Sent' | 'Delivered' | 'Failed';

const FILTER_LABELS: Record<DateRangeFilter, string> = {
  under7: 'All Under 7 Days',
  today: 'Today',
  tomorrow: 'Tomorrow',
  '2to7': '2–7 Days Ahead',
};

export function BirthdayPage({
  snapshot,
  selectedBirthdayCustomer,
  onSelectBirthdayCustomer,
  onOpenOffersModal,
  onSendBirthdaySms,
  onSendFilteredBirthdaySms,
}: BirthdayPageProps) {
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('under7');
  const [statusFilter, setStatusFilter] = useState<SmsStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [bulkOptionId, setBulkOptionId] = useState<1 | 2>(1);

  // Composer state for selected birthday customer
  const [selectedOptionId, setSelectedOptionId] = useState<1 | 2>(1);
  const [isEditingMsg, setIsEditingMsg] = useState(false);
  const [editedMsg, setEditedMsg] = useState('');
  const [allowResend, setAllowResend] = useState(false);

  const under7Birthdays = useMemo(
    () => snapshot.birthdays.filter((b) => b.days_remaining >= 0 && b.days_remaining <= 7),
    [snapshot.birthdays]
  );

  const filteredBirthdays = useMemo(() => {
    const q = search.trim().toLowerCase();
    return under7Birthdays.filter((b) => {
      if (dateFilter === 'today' && b.days_remaining !== 0) return false;
      if (dateFilter === 'tomorrow' && b.days_remaining !== 1) return false;
      if (dateFilter === '2to7' && (b.days_remaining < 2 || b.days_remaining > 7)) return false;

      if (statusFilter !== 'all' && b.sms_status !== statusFilter) return false;

      if (q) {
        const hay = `${b.customer.customer_name} ${b.customer.contact_no} ${
          b.customer.most_ordered_dish || ''
        } ${b.customer.cluster_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [under7Birthdays, dateFilter, statusFilter, search]);

  const unsentFiltered = useMemo(
    () => filteredBirthdays.filter((b) => b.sms_status === 'Not Sent'),
    [filteredBirthdays]
  );

  const activeApprovedOffers: BirthdayOffer[] = snapshot.birthday_offers.filter(
    (o) => o.is_active && o.owner_approved
  );

  const openComposer = (b: EnrichedBirthdayCustomer) => {
    onSelectBirthdayCustomer(b);
    setSelectedOptionId(1);
    setIsEditingMsg(false);
    setEditedMsg(b.sms_options[0].message);
    setAllowResend(false);
  };

  const activeOption = selectedBirthdayCustomer
    ? selectedBirthdayCustomer.sms_options.find((o) => o.option_id === selectedOptionId) ||
      selectedBirthdayCustomer.sms_options[0]
    : null;

  const finalMessage =
    selectedBirthdayCustomer && activeOption
      ? isEditingMsg || editedMsg
        ? editedMsg
        : activeOption.message
      : '';

  const alreadySentForOccurrence = Boolean(selectedBirthdayCustomer?.last_birthday_campaign);
  const todayCount = under7Birthdays.filter((b) => b.days_remaining === 0).length;
  const tomorrowCount = under7Birthdays.filter((b) => b.days_remaining === 1).length;

  return (
    <div className="tab-animate space-y-4">
      <div className="hero-row" style={{ marginBottom: 6 }}>
        <div>
          <h1>Upcoming Birthdays (Next 7 Days)</h1>
          <p className="hero-subtitle">
            Shows only guests celebrating their birthday within the next 7 days, with warm advance birthday wishes tailored to each guest group.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" className="btn btn-outline btn-sm" onClick={onOpenOffersModal}>
            <Gift size={14} />
            Birthday Offers ({activeApprovedOffers.length} Active)
          </button>

          <div className="surface-card kpi-card" style={{ padding: '10px 18px', gap: 16 }}>
            <div className="kpi-col">
              <span className="kpi-label">TODAY</span>
              <strong className="kpi-val">{todayCount}</strong>
            </div>
            <div className="kpi-divider" />
            <div className="kpi-col">
              <span className="kpi-label">TOMORROW</span>
              <strong className="kpi-val">{tomorrowCount}</strong>
            </div>
            <div className="kpi-divider" />
            <div className="kpi-col">
              <span className="kpi-label">UNDER 7 DAYS</span>
              <strong className="kpi-val">{under7Birthdays.length}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Spacious Two-Zone Filter Toolbar */}
      <div className="surface-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="field-input w-full"
              style={{ paddingLeft: 32 }}
              placeholder="Search guest, phone, dish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="lang-pill-group flex-wrap gap-1">
            {(
              [
                ['under7', `All Under 7 Days (${under7Birthdays.length})`],
                ['today', `Today (${todayCount})`],
                ['tomorrow', `Tomorrow (${tomorrowCount})`],
                ['2to7', '2–7 Days Ahead'],
              ] as Array<[DateRangeFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`lang-btn ${dateFilter === key ? 'active' : ''}`}
                onClick={() => setDateFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-100">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="field-input min-w-[165px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SmsStatusFilter)}
            >
              <option value="all">All SMS Statuses</option>
              <option value="Not Sent">SMS Not Sent</option>
              <option value="Sent">SMS Sent</option>
              <option value="Delivered">Delivered</option>
              <option value="Failed">Failed</option>
            </select>

            <select
              className="field-input min-w-[225px]"
              aria-label="Bulk birthday message style"
              value={bulkOptionId}
              onChange={(e) => setBulkOptionId(Number(e.target.value) as 1 | 2)}
            >
              <option value={1}>Option 1: Warm Advance Wish</option>
              <option value={2}>Option 2: Offer (VIP Hospitality Only)</option>
            </select>
          </div>

          <button
            type="button"
            className={`btn btn-sm shrink-0 ${unsentFiltered.length > 0 ? 'btn-brand' : 'btn-emerald'}`}
            disabled={unsentFiltered.length === 0}
            title={`Send tailored birthday SMS to all unsent guests matching "${FILTER_LABELS[dateFilter]}"`}
            onClick={() =>
              onSendFilteredBirthdaySms({
                guests: unsentFiltered,
                option_id: bulkOptionId,
                filter_label: FILTER_LABELS[dateFilter],
              })
            }
          >
            <Send size={13} />
            {unsentFiltered.length > 0
              ? `Send SMS to Filtered (${unsentFiltered.length})`
              : 'All Filtered Sent'}
          </button>
        </div>
      </div>

      {/* Clean Simple Table Matching Customer Directory (Only Send Message Buttons Colored) */}
      {filteredBirthdays.length === 0 ? (
        <div className="surface-card p-8 text-center text-sm text-slate-500">
          No upcoming customer birthdays within the selected 7-day filter.
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold whitespace-nowrap">
                  <th className="py-3 px-4">Guest</th>
                  <th className="py-3 px-3">DOB</th>
                  <th className="py-3 px-3">Upcoming Birthday</th>
                  <th className="py-3 px-3">Advance Timing</th>
                  <th className="py-3 px-3">Favourite Dish &amp; Category</th>
                  <th className="py-3 px-3">Visits &amp; Avg Spend</th>
                  <th className="py-3 px-3">Cluster Type</th>
                  <th className="py-3 px-3">SMS Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredBirthdays.map((b) => (
                  <tr
                    key={b.customer.customer_id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-900">{b.customer.customer_name}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatPhone(b.customer.contact_no)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      {b.dob}
                      {b.leap_year_adjusted && (
                        <div className="text-[10px] text-slate-500">Observed Feb 28</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-zinc-900 whitespace-nowrap">
                      <div className="font-semibold">{b.upcoming_birthday_label}</div>
                      <div className="text-[11px] text-slate-500">{b.next_birthday_date}</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="cluster-tag-pill">
                        {b.days_remaining === 0
                          ? 'Today'
                          : b.days_remaining === 1
                          ? 'Tomorrow (1d advance)'
                          : `In ${b.days_remaining} days (advance)`}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-zinc-900">
                        {b.customer.most_ordered_dish || 'House Specials'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {b.customer.top_food_category}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-700">
                      <div>
                        <strong className="text-zinc-900">{b.customer.total_visits}</strong> visits
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Avg {formatINR(b.customer.avg_spend_per_visit_inr)}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="cluster-tag-pill">{b.customer.cluster_name}</span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-slate-200 bg-white text-slate-700">
                        {b.sms_status === 'Not Sent' ? 'Not Sent' : b.sms_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn btn-brand btn-sm"
                        onClick={() => openComposer(b)}
                      >
                        <MessageSquare size={12} />
                        {b.sms_status === 'Not Sent' ? 'Prepare SMS' : 'View / Resend'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Personalized 2-Option Advance Birthday SMS Modal */}
      {selectedBirthdayCustomer && activeOption && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelectBirthdayCustomer(null);
          }}
        >
          <div className="modal-card" style={{ maxWidth: 780 }}>
            <button
              type="button"
              className="modal-close"
              aria-label="Close"
              onClick={() => onSelectBirthdayCustomer(null)}
            >
              &times;
            </button>

            <div className="flex items-center justify-between gap-3 flex-wrap mb-4 pr-8">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                  style={{ background: 'var(--brand)' }}
                >
                  <Cake size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">
                    Birthday SMS for {selectedBirthdayCustomer.customer.customer_name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {formatPhone(selectedBirthdayCustomer.customer.contact_no)} ·{' '}
                    <strong>{selectedBirthdayCustomer.customer.cluster_name}</strong> ·{' '}
                    Upcoming: <strong>{selectedBirthdayCustomer.upcoming_birthday_label}</strong> (
                    {selectedBirthdayCustomer.days_remaining === 0
                      ? 'Today'
                      : `${selectedBirthdayCustomer.days_remaining}d in advance`}
                    )
                  </p>
                </div>
              </div>
              <span className="doc-tag">
                Channel: <strong>SMS</strong>
              </span>
            </div>

            {selectedBirthdayCustomer.customer.cluster_id === 1 && (
              <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs text-sky-900 font-medium">
                Premium Customer Protocol: Standard, dignified VIP hospitality wishes only — promotional offers and coupon codes are omitted.
              </div>
            )}

            {alreadySentForOccurrence && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-700" />
                <div className="flex-1">
                  <div className="font-semibold">
                    Duplicate Prevention Active for {selectedBirthdayCustomer.next_birthday_date}
                  </div>
                  <p className="mt-0.5 text-amber-800">
                    A birthday SMS was already recorded for this upcoming birthday (Status:{' '}
                    <strong>{selectedBirthdayCustomer.sms_status}</strong>).
                  </p>
                  <label className="inline-flex items-center gap-2 mt-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowResend}
                      onChange={(e) => setAllowResend(e.target.checked)}
                    />
                    Authorize explicit resend for this birthday occurrence
                  </label>
                </div>
              </div>
            )}

            {/* 2 Personalized Advance Birthday SMS Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {selectedBirthdayCustomer.sms_options.map((opt) => {
                const active = opt.option_id === selectedOptionId;
                return (
                  <button
                    key={opt.option_id}
                    type="button"
                    className={`template-card ${active ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedOptionId(opt.option_id);
                      setIsEditingMsg(false);
                      setEditedMsg(opt.message);
                    }}
                  >
                    <div className="template-card-top">
                      <span className="template-badge">Option {opt.option_id}</span>
                      <span className="radio-circle">{active ? '✓' : ''}</span>
                    </div>
                    <h3>{opt.label}</h3>
                    <div className="template-card-note">{opt.description}</div>
                  </button>
                );
              })}
            </div>

            {/* Editable Preview Box */}
            <div className="preview-box">
              <div className="preview-top">
                <div className="preview-doc-meta">
                  <span className="doc-tag">
                    Channel: <strong>SMS Only</strong>
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setIsEditingMsg((v) => !v)}
                >
                  {isEditingMsg ? '✓ Done Editing' : '✎ Edit SMS'}
                </button>
              </div>

              {isEditingMsg ? (
                <textarea
                  className="custom-textarea"
                  rows={4}
                  value={finalMessage}
                  onChange={(e) => setEditedMsg(e.target.value)}
                />
              ) : (
                <div className="preview-message-card">
                  <HighlightedMessage text={finalMessage} />
                </div>
              )}

              <div className="preview-bottom">
                <span className="preview-channel-note">
                  {selectedBirthdayCustomer.customer.cluster_id === 1
                    ? 'Standard VIP Hospitality (No Offers/Coupons)'
                    : activeOption.uses_offer_title
                    ? `Approved Offer: ${activeOption.uses_offer_title}`
                    : 'No promotional offer attached'}
                </span>
                <button
                  type="button"
                  className="btn btn-brand"
                  disabled={alreadySentForOccurrence && !allowResend}
                  onClick={() => {
                    if (!selectedBirthdayCustomer.next_birthday_date) return;
                    onSendBirthdaySms({
                      customer_id: selectedBirthdayCustomer.customer.customer_id,
                      customer_name: selectedBirthdayCustomer.customer.customer_name,
                      birthday_occurrence: selectedBirthdayCustomer.next_birthday_date,
                      message_content: finalMessage,
                      offer_id: activeOption.uses_offer_id,
                      allow_resend: allowResend,
                    });
                  }}
                >
                  Send Birthday SMS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}