import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { AlertsPage } from './components/AlertsPage';
import { BirthdayOffersModal } from './components/BirthdayOffersModal';
import { BirthdayPage } from './components/BirthdayPage';
import { CustomersPage } from './components/CustomersPage';
import { GuestDetailModal } from './components/GuestDetailModal';
import { GuestGroupsStudioPage } from './components/GuestGroupsStudioPage';
import { HistoryPage } from './components/HistoryPage';
import { Navbar } from './components/Navbar';
import { OverviewPage } from './components/OverviewPage';
import { SegmentationPage } from './components/SegmentationPage';
import { SimulatedSmsModal } from './components/SimulatedSmsModal';
import { api } from './services/api';
import type {
  BirthdayOffer,
  CampaignRecord,
  CustomerRecord,
  DashboardSnapshot,
  EnrichedBirthdayCustomer,
  NavTab,
} from './types';
import { CLUSTER_CONFIG } from './utils/formatters';

export default function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [selectedClusterId, setSelectedClusterId] = useState<number>(0);

  // Modals & Cross-tab selections
  const [inspectedCustomer, setInspectedCustomer] = useState<CustomerRecord | null>(null);
  const [selectedBirthdayCustomer, setSelectedBirthdayCustomer] =
    useState<EnrichedBirthdayCustomer | null>(null);
  const [showOffersModal, setShowOffersModal] = useState(false);

  // SMS Dispatch Modal state
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [dispatchedCampaign, setDispatchedCampaign] = useState<CampaignRecord | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const fetchSnapshot = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getDashboard();
      if (!data?.metrics) {
        throw new Error('Dashboard metrics unavailable.');
      }
      setSnapshot(data);
      setLoadError(null);
      setSelectedBirthdayCustomer((prev) => {
        if (!prev) return null;
        return data.birthdays.find((b) => b.customer.customer_id === prev.customer.customer_id) || null;
      });
      setInspectedCustomer((prev) => {
        if (!prev) return null;
        return data.customers.find((c) => c.customer_id === prev.customer_id) || null;
      });
    } catch (err) {
      if (!silent) {
        setLoadError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot(false);
    const interval = setInterval(() => {
      void fetchSnapshot(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  const dispatchSmsCampaign = useCallback(
    async (payload: {
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
    }) => {
      setSmsModalOpen(true);
      setIsSendingSms(true);
      setDispatchedCampaign(null);
      setSmsError(null);

      try {
        const minAnimDelay = new Promise((resolve) => setTimeout(resolve, 900));
        const [result] = await Promise.all([api.sendSmsCampaign(payload), minAnimDelay]);
        if (result?.snapshot?.metrics) {
          setSnapshot(result.snapshot);
        }
        setDispatchedCampaign(result.campaign);
        setSelectedBirthdayCustomer((prev) => {
          if (!prev || !result?.snapshot?.birthdays) return null;
          return (
            result.snapshot.birthdays.find(
              (b) => b.customer.customer_id === prev.customer.customer_id
            ) || null
          );
        });
        showToast(
          `SMS sent to ${result.campaign.recipient_count} guest(s) (${result.campaign.delivered_count} delivered).`
        );
      } catch (err) {
        setSmsError(err instanceof Error ? err.message : 'SMS dispatch failed.');
      } finally {
        setIsSendingSms(false);
      }
    },
    [showToast]
  );

  const handleMessageGroup = useCallback((cid: number) => {
    setSelectedClusterId(cid);
    setActiveTab('segments');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSaveCustomer = useCallback(
    async (payload: Partial<CustomerRecord> & { customer_name: string; contact_no: string }) => {
      const res = await api.upsertCustomer(payload);
      if (res?.snapshot?.metrics) {
        setSnapshot(res.snapshot);
      }
      setInspectedCustomer((prev) =>
        prev && prev.customer_id === res.customer.customer_id ? res.customer : prev
      );
      if (res.queued_for_ml_batch && !res.pipeline_executed) {
        showToast(
          `${res.customer.customer_name} updated & queued for ML batch (${res.queued_count}/${res.batch_threshold}).`
        );
      } else if (res.pipeline_executed) {
        showToast('Batch processed through ML pipeline and updated on dashboard.');
      } else {
        showToast(
          `Saved ${res.customer.customer_name} (${res.customer.cluster_name}) · Avg ₹${Math.round(
            res.customer.avg_spend_per_visit_inr
          )}/visit.`
        );
      }
    },
    [showToast]
  );

  const handleSaveOffer = useCallback(
    async (payload: Partial<BirthdayOffer> & { title: string; discount_or_benefit: string }) => {
      const res = await api.upsertBirthdayOffer(payload);
      if (res?.snapshot?.metrics) {
        setSnapshot(res.snapshot);
      }
      showToast(`Birthday offer "${res.offer.title}" saved.`);
    },
    [showToast]
  );

  const handleDeleteOffer = useCallback(
    async (offerId: string) => {
      const res = await api.deleteBirthdayOffer(offerId);
      if (res?.snapshot?.metrics) {
        setSnapshot(res.snapshot);
      }
      showToast('Birthday offer removed.');
    },
    [showToast]
  );

  const handleBulkSendAlerts = useCallback(
    (guests: CustomerRecord[]) => {
      if (guests.length === 0) return;
      void dispatchSmsCampaign({
        campaign_name: `Guest Follow-Up Messages (${guests.length} Guests)`,
        campaign_type: 'bulk_alert',
        cluster_id: null,
        cluster_name: 'High Alert Guests',
        message_content:
          "Greetings from Mother's Hut!\nHi {customer_name}, Tailored follow-up message per guest group (no offers for Premium Customers).",
        language: 'en',
        recipient_ids: guests.map((g) => g.customer_id),
      });
    },
    [dispatchSmsCampaign]
  );

  const handleFilteredBirthdayBulkSend = useCallback(
    (payload: {
      guests: EnrichedBirthdayCustomer[];
      option_id: 1 | 2;
      filter_label: string;
    }) => {
      if (payload.guests.length === 0) return;
      void dispatchSmsCampaign({
        campaign_name: `Birthday Wishes — ${payload.filter_label} (${payload.guests.length} Guests)`,
        campaign_type: 'bulk_birthday',
        cluster_id: null,
        cluster_name: `Birthdays · ${payload.filter_label}`,
        message_content:
          "Greetings from Mother's Hut!\nHi {customer_name}, Personalized advance birthday wishes sent per guest and dining group (no offers for Premium Customers).",
        language: 'en',
        recipient_ids: payload.guests.map((g) => g.customer.customer_id),
        birthday_option_id: payload.option_id,
      });
    },
    [dispatchSmsCampaign]
  );

  const isClusterThemeTab = activeTab === 'segments';
  const themeClusterId = isClusterThemeTab ? selectedClusterId : undefined;

  return (
    <div
      className="app-shell"
      data-cluster={themeClusterId !== undefined ? String(themeClusterId) : undefined}
    >
      {loading && !snapshot ? (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="surface-card p-8 text-center max-w-sm w-full">
            <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: 'var(--brand)' }} />
            <div className="text-sm font-semibold text-zinc-900">Loading Mother&apos;s Hut Portal</div>
            <p className="text-xs text-slate-500 mt-1">
              Loading full guest dataset, dining groups, and upcoming birthdays...
            </p>
          </div>
        </div>
      ) : loadError && !snapshot ? (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="surface-card p-8 text-center max-w-md w-full space-y-3">
            <div className="text-base font-semibold text-red-700">Failed to Connect to Server</div>
            <p className="text-xs text-slate-600">{loadError}</p>
            <button type="button" className="btn btn-brand btn-sm" onClick={() => fetchSnapshot(false)}>
              <RefreshCw size={14} /> Retry Connection
            </button>
          </div>
        </div>
      ) : snapshot && snapshot.metrics ? (
        <>
          <Navbar
            activeTab={activeTab}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            urgentBirthdaysCount={snapshot.metrics.upcoming_birthdays_7d}
            highAlertsCount={snapshot.metrics.high_alerts_remaining}
            historyCount={snapshot.metrics.total_campaigns}
          />

          <main className="main-container flex-1 w-full">
            {activeTab === 'overview' && (
              <OverviewPage
                snapshot={snapshot}
                onNavigate={(tab) => {
                  setActiveTab(tab);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onSelectGroup={handleMessageGroup}
              />
            )}

            {activeTab === 'segments' && (
              <GuestGroupsStudioPage
                snapshot={snapshot}
                selectedClusterId={selectedClusterId}
                onSelectClusterId={setSelectedClusterId}
                onLaunchSimulatedCampaign={(payload) => void dispatchSmsCampaign(payload)}
              />
            )}

            {activeTab === 'segmentation' && (
              <SegmentationPage snapshot={snapshot} onMessageGroup={handleMessageGroup} />
            )}

            {activeTab === 'customers' && (
              <CustomersPage
                snapshot={snapshot}
                onInspectCustomer={(c) => setInspectedCustomer(c)}
              />
            )}

            {activeTab === 'birthday' && (
              <BirthdayPage
                snapshot={snapshot}
                selectedBirthdayCustomer={selectedBirthdayCustomer}
                onSelectBirthdayCustomer={setSelectedBirthdayCustomer}
                onOpenOffersModal={() => setShowOffersModal(true)}
                onSendBirthdaySms={(payload) =>
                  void dispatchSmsCampaign({
                    campaign_name: `Birthday Wishes — ${payload.customer_name}`,
                    campaign_type: 'birthday',
                    cluster_id: null,
                    cluster_name: 'Birthday Celebration',
                    message_content: payload.message_content,
                    language: 'en',
                    recipient_ids: [payload.customer_id],
                    birthday_occurrence: payload.birthday_occurrence,
                    offer_id: payload.offer_id,
                    allow_resend: payload.allow_resend,
                  })
                }
                onSendFilteredBirthdaySms={handleFilteredBirthdayBulkSend}
              />
            )}

            {activeTab === 'alerts' && (
              <AlertsPage
                snapshot={snapshot}
                onOpenGuestModal={(c) => setInspectedCustomer(c)}
                onBulkSendAlerts={handleBulkSendAlerts}
              />
            )}

            {activeTab === 'history' && <HistoryPage snapshot={snapshot} />}
          </main>

          <footer className="app-footer">
            Mother&apos;s Hut Guest Portal • Guest Groups and Message, Upcoming Birthdays &amp; Messaging Studio
          </footer>
        </>
      ) : null}

      {/* Guest Profile 2-Column Modal */}
      <GuestDetailModal
        customer={inspectedCustomer}
        allCustomers={snapshot?.customers || []}
        isSent={
          inspectedCustomer
            ? snapshot?.contacted_alert_ids.includes(inspectedCustomer.customer_id) ?? false
            : false
        }
        onClose={() => setInspectedCustomer(null)}
        onSaveCustomer={handleSaveCustomer}
        onSendSimulatedSms={({ customer, message, language }) => {
          const cfg = CLUSTER_CONFIG[customer.cluster_id];
          setInspectedCustomer(null);
          void dispatchSmsCampaign({
            campaign_name: `Guest Follow-Up — ${customer.customer_name}`,
            campaign_type: 'alert',
            cluster_id: customer.cluster_id,
            cluster_name: cfg?.name || customer.cluster_name,
            message_content: message,
            language,
            recipient_ids: [customer.customer_id],
          });
        }}
      />

      {/* Birthday Offer Management Modal */}
      <BirthdayOffersModal
        isOpen={showOffersModal}
        offers={snapshot?.birthday_offers || []}
        onClose={() => setShowOffersModal(false)}
        onSaveOffer={handleSaveOffer}
        onDeleteOffer={handleDeleteOffer}
      />

      {/* SMS Dispatch Progress & Results Modal */}
      <SimulatedSmsModal
        isOpen={smsModalOpen}
        isSimulating={isSendingSms}
        campaign={dispatchedCampaign}
        errorMessage={smsError}
        onClose={() => {
          setSmsModalOpen(false);
          setDispatchedCampaign(null);
          setSmsError(null);
        }}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}