import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, List, Send, TrendingDown } from 'lucide-react';
import type { CustomerRecord, DashboardSnapshot } from '../types';
import {
  formatINR,
  formatPhone,
  getRealisticOffer,
  REVENUE_PASSWORD,
} from '../utils/formatters';

interface AlertsPageProps {
  snapshot: DashboardSnapshot;
  onOpenGuestModal: (c: CustomerRecord) => void;
  onBulkSendAlerts: (guests: CustomerRecord[]) => void;
}

const ALERT_PAGE_SIZE = 48;

export function AlertsPage({
  snapshot,
  onOpenGuestModal,
  onBulkSendAlerts,
}: AlertsPageProps) {
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('all');
  const [sentFilter, setSentFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState('HIGH_PRIORITY_ALERT');
  const [alertView, setAlertView] = useState<'tiles' | 'list'>('tiles');
  const [page, setPage] = useState(1);

  const [revenueUnlocked, setRevenueUnlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    if (!revenueUnlocked) return;
    if (secondsLeft <= 0) {
      setRevenueUnlocked(false);
      return;
    }
    const timer = setTimeout(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [revenueUnlocked, secondsLeft]);

  const contactedSet = useMemo(
    () => new Set(snapshot.contacted_alert_ids),
    [snapshot.contacted_alert_ids]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = snapshot.customers.filter((c) => {
      if (flagFilter !== 'all' && c.churn_alert_flag !== flagFilter) return false;
      if (clusterFilter !== 'all' && String(c.cluster_id) !== clusterFilter) return false;
      const isSent = contactedSet.has(c.customer_id);
      if (sentFilter === 'unsent' && isSent) return false;
      if (sentFilter === 'sent' && !isSent) return false;
      if (q) {
        const hay = `${c.customer_name} ${c.contact_no} ${c.customer_id} ${c.most_ordered_dish || ''} ${c.area}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const aSent = contactedSet.has(a.customer_id) ? 1 : 0;
      const bSent = contactedSet.has(b.customer_id) ? 1 : 0;
      if (aSent !== bSent) return aSent - bSent;
      return b.days_since_last_visit - a.days_since_last_visit;
    });
    return list;
  }, [snapshot.customers, flagFilter, clusterFilter, sentFilter, search, contactedSet]);

  useEffect(() => {
    setPage(1);
  }, [search, clusterFilter, sentFilter, flagFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ALERT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => {
    const start = (safePage - 1) * ALERT_PAGE_SIZE;
    return filtered.slice(start, start + ALERT_PAGE_SIZE);
  }, [filtered, safePage]);

  const unsentGuests = useMemo(
    () => filtered.filter((c) => !contactedSet.has(c.customer_id)),
    [filtered, contactedSet]
  );
  const sentCountInView = filtered.length - unsentGuests.length;
  const riskBaseList = sentFilter === 'sent' ? filtered : unsentGuests;
  const totalPotentialRevenue = riskBaseList.reduce(
    (acc, c) => acc + (Number(c.total_spend_inr) || 0),
    0
  );

  return (
    <div className="tab-animate">
      <div className="hero-row">
        <div>
          <h1>Guest Alerts</h1>
          <p className="hero-subtitle">
            Click any guest to open their interactive profile, or send personalized offers to all unsent guests at once.
          </p>
        </div>

        <button
          type="button"
          className="surface-card kpi-card alert-kpi-card"
          onClick={() => {
            if (revenueUnlocked) {
              setRevenueUnlocked(false);
              setSecondsLeft(0);
            } else {
              setPinInput('');
              setPinError('');
              setShowPinModal(true);
            }
          }}
        >
          <span className="alert-kpi-icon-box" aria-hidden="true">
            <TrendingDown size={18} />
          </span>
          <div className="kpi-col">
            <span className="kpi-label kpi-label-red">
              POTENTIAL REVENUE {revenueUnlocked ? `(${secondsLeft}s)` : ''}
            </span>
            <strong className="kpi-val text-red-dark">
              {revenueUnlocked ? formatINR(totalPotentialRevenue) : '* ₹'}
            </strong>
          </div>
          <div className="alert-kpi-divider" />
          <div className="kpi-col">
            <span className="kpi-label">AT-RISK GUESTS</span>
            <strong className="kpi-val">{filtered.length.toLocaleString()}</strong>
          </div>
          <div className="alert-kpi-divider" />
          <div className="kpi-col">
            <span className="kpi-label">UNSENT</span>
            <strong className="kpi-val">{unsentGuests.length.toLocaleString()}</strong>
          </div>
        </button>
      </div>

      {/* Unified Filter + View Switcher + One-Click Send All */}
      <div className="surface-card alert-toolbar">
        <div className="alert-filter-bar">
          <input
            type="search"
            className="field-input"
            placeholder="Search name, phone, ID, dish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="field-input"
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
          >
            <option value="all">All Groups</option>
            {snapshot.cluster_profiles.map((p) => (
              <option key={p.cluster_id} value={String(p.cluster_id)}>
                {p.cluster_name}
              </option>
            ))}
          </select>
          <select
            className="field-input"
            value={sentFilter}
            onChange={(e) => setSentFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="unsent">Unsent Only</option>
            <option value="sent">Sent Only</option>
          </select>
          <select
            className="field-input"
            value={flagFilter}
            onChange={(e) => setFlagFilter(e.target.value)}
          >
            <option value="HIGH_PRIORITY_ALERT">High Alerts Only</option>
            <option value="all">All Guests</option>
          </select>
        </div>

        <div className="alert-right-controls">
          <div className="view-toggle-group" role="group" aria-label="View format">
            <button
              type="button"
              className={`view-mode-btn ${alertView === 'tiles' ? 'active' : ''}`}
              onClick={() => setAlertView('tiles')}
            >
              <LayoutGrid size={13} />
              Tiles
            </button>
            <button
              type="button"
              className={`view-mode-btn ${alertView === 'list' ? 'active' : ''}`}
              onClick={() => setAlertView('list')}
            >
              <List size={13} />
              List
            </button>
          </div>

          <button
            type="button"
            className={`btn btn-sm ${unsentGuests.length > 0 ? 'btn-brand' : 'btn-emerald'}`}
            disabled={unsentGuests.length === 0}
            onClick={() => onBulkSendAlerts(unsentGuests)}
          >
            <Send size={13} />
            {unsentGuests.length > 0 ? `Send All Unsent (${unsentGuests.length})` : '✓ All Sent'}
          </button>
        </div>
      </div>

      <div className="alert-summary-chips">
        <span className="summary-chip">
          Showing <strong>{filtered.length.toLocaleString()}</strong> guests
        </span>
        <span className="summary-chip">
          Unsent: <strong>{unsentGuests.length.toLocaleString()}</strong>
        </span>
        <span className="summary-chip">
          Sent: <strong className="text-green">{sentCountInView.toLocaleString()}</strong>
        </span>
      </div>

      <div className={`alert-cards-grid ${alertView === 'list' ? 'is-list-view' : ''}`}>
        {visibleItems.length === 0 ? (
          <div
            className="surface-card"
            style={{ padding: 26, gridColumn: '1 / -1', textAlign: 'center', color: '#64748b' }}
          >
            No matching guests found for this filter.
          </div>
        ) : (
          visibleItems.map((c) => {
            const isSent = contactedSet.has(c.customer_id);
            const offer = getRealisticOffer(c);
            return (
              <div
                key={c.customer_id}
                className={`alert-customer-card ${isSent ? 'is-sent' : ''}`}
                onClick={() => onOpenGuestModal(c)}
              >
                <div className="ac-top">
                  <div className="ac-identity">
                    <div className="ac-name">{c.customer_name}</div>
                    <div className="ac-phone">{formatPhone(c.contact_no)}</div>
                  </div>
                  {isSent && <span className="ac-pill-sent">✓ Sent</span>}
                </div>

                <div className="ac-offer-preview">
                  {offer.offerTitle}
                  {offer.coupon && (
                    <>
                      {' '}
                      · <strong className="hl-coupon">{offer.coupon}</strong>
                    </>
                  )}
                </div>

                <div className="ac-bottom">
                  <span>
                    Last Visit: <strong>{c.days_since_last_visit}d ago</strong>
                  </span>
                  <span>{c.cluster_name}</span>
                  <span>
                    Avg: <strong>{formatINR(c.avg_spend_per_visit_inr)}</strong>
                  </span>
                </div>

                <span className="list-action-hint">{isSent ? 'View →' : 'Open →'}</span>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="surface-card mt-4 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap text-xs">
          <span className="text-slate-600">
            Page <strong className="text-zinc-900">{safePage}</strong> of{' '}
            <strong className="text-zinc-900">{totalPages}</strong> ({filtered.length.toLocaleString()} guests)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Manager Password Modal for Potential Revenue */}
      {showPinModal && (
        <div
          className="pin-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPinModal(false);
          }}
        >
          <form
            className="pin-modal"
            onSubmit={(e) => {
              e.preventDefault();
              if (pinInput.trim() === REVENUE_PASSWORD) {
                setRevenueUnlocked(true);
                setSecondsLeft(10);
                setShowPinModal(false);
              } else {
                setPinError('Incorrect password');
              }
            }}
          >
            <h3 className="text-sm font-semibold text-zinc-900 mb-0.5">Enter Password</h3>
            <p className="text-xs text-slate-500 mb-3">
              Enter manager password to view revenue (auto-hides in 10s).
            </p>
            <input
              type="password"
              autoFocus
              className="w-full text-sm tracking-widest px-3 py-2 border border-slate-300 rounded-lg outline-none mb-1.5"
              placeholder="••••"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
            />
            <div className="text-[11px] text-red-600 min-h-4 mb-2">{pinError}</div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setShowPinModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-brand btn-sm">
                Unlock
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}