import { useState } from 'react';
import { CheckCircle2, Clock, MessageSquare, Receipt, XCircle } from 'lucide-react';
import type { CampaignRecord, DashboardSnapshot } from '../types';
import { formatPhone } from '../utils/formatters';
import { BRAND_LOGO_URL } from '../utils/formatters';
import { HighlightedMessage } from './MessageHighlighter';

interface HistoryPageProps {
  snapshot: DashboardSnapshot;
}

function formatFullTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function getOneLineSnippet(msg: string): string {
  const lines = msg
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const body = lines.length > 1 && lines[0].toLowerCase().includes("mother's hut") ? lines[1] : lines[0] || '';
  return body.length > 96 ? `${body.slice(0, 96)}…` : body;
}

export function HistoryPage({ snapshot }: HistoryPageProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignRecord | null>(null);
  const { campaigns } = snapshot;

  return (
    <div className="tab-animate space-y-4">
      <div className="hero-row" style={{ marginBottom: 4 }}>
        <div>
          <h1>Sent Message History</h1>
          <p className="hero-subtitle">
            Timestamped SMS receipts across guest groups, birthdays, and follow-ups. Click any entry for a short delivery receipt.
          </p>
        </div>
      </div>

      {/* Eye-Catching To-The-Point History List */}
      <section className="surface-card history-panel">
        {campaigns.length === 0 ? (
          <p className="text-center text-slate-500 text-xs py-10">
            No messages sent yet. Send one from <strong>Guest Groups and Message</strong>,{' '}
            <strong>BIRTHDAY</strong>, or <strong>Alert</strong>.
          </p>
        ) : (
          <div>
            {campaigns.map((c) => {
              const allDelivered = c.delivered_count === c.recipient_count && c.recipient_count > 0;
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  className="history-item"
                  onClick={() => setSelectedCampaign(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedCampaign(c);
                    }
                  }}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        background: allDelivered ? 'var(--green-soft)' : 'var(--brand-soft)',
                        color: allDelivered ? 'var(--green-dark)' : 'var(--brand-hover)',
                        border: `1px solid ${allDelivered ? 'var(--green-border)' : 'var(--brand-border)'}`,
                      }}
                    >
                      <MessageSquare size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="history-title">{c.campaign_name}</span>
                        {c.cluster_name && (
                          <span className="cluster-tag-pill">{c.cluster_name}</span>
                        )}
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{
                            background: 'var(--green-soft)',
                            color: 'var(--green-dark)',
                            border: '1px solid var(--green-border)',
                          }}
                        >
                          <CheckCircle2 size={11} />
                          {c.delivered_count}/{c.recipient_count} Delivered
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 truncate">
                        {getOneLineSnippet(c.message_content)}
                      </p>
                    </div>
                  </div>

                  <div className="history-meta">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-zinc-800">
                      <Clock size={12} style={{ color: 'var(--brand)' }} />
                      <span>{formatFullTimestamp(c.created_at)}</span>
                    </div>
                    <div className="text-[11px] font-medium mt-1 inline-flex items-center gap-1 justify-end w-full" style={{ color: 'var(--brand-hover)' }}>
                      <Receipt size={11} />
                      <span>
                        {c.recipient_count} {c.recipient_count === 1 ? 'receipt' : 'receipts'} · View →
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Short Receipt-Type Popup Modal */}
      {selectedCampaign && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCampaign(null);
          }}
        >
          <div className="modal-card" style={{ maxWidth: 460, padding: '20px 22px' }}>
            <button
              type="button"
              className="modal-close"
              aria-label="Close Receipt"
              onClick={() => setSelectedCampaign(null)}
            >
              &times;
            </button>

            {/* Receipt Header */}
            <div className="flex items-center gap-3 pr-8 pb-3 border-b border-dashed border-slate-300">
              <img
                src={BRAND_LOGO_URL}
                alt="Mother's Hut"
                className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <span
                  className="block text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--brand)' }}
                >
                  SMS Dispatch Receipt
                </span>
                <h2 className="text-sm font-bold text-zinc-900 truncate">
                  {selectedCampaign.campaign_name}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {formatFullTimestamp(selectedCampaign.created_at)} · #{selectedCampaign.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>

            {/* Key-Value Receipt Grid */}
            <div className="grid grid-cols-2 gap-2 py-3 border-b border-dashed border-slate-300 text-xs">
              <div className="stat-tile">
                <span className="tile-label">Group / Scope</span>
                <strong className="text-xs font-semibold text-zinc-900 truncate block">
                  {selectedCampaign.cluster_name || 'Guest Messaging'}
                </strong>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Channel &amp; Lang</span>
                <strong className="text-xs font-semibold text-zinc-900 block">
                  SMS · {selectedCampaign.language === 'bn' ? 'Bengali' : 'English'}
                </strong>
              </div>
              <div
                className="stat-tile"
                style={{ background: 'var(--green-soft)', borderColor: 'var(--green-border)' }}
              >
                <span className="tile-label">Delivered</span>
                <strong className="tile-val text-green">
                  {selectedCampaign.delivered_count} / {selectedCampaign.recipient_count}
                </strong>
              </div>
              <div className="stat-tile tile-alert">
                <span className="tile-label">Failed</span>
                <strong className="tile-val text-red-dark">{selectedCampaign.failed_count}</strong>
              </div>
            </div>

            {/* Concise Message Copy */}
            <div className="py-3 border-b border-dashed border-slate-300">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Message Dispatched
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-zinc-800 whitespace-pre-line leading-relaxed">
                <HighlightedMessage text={selectedCampaign.message_content} />
              </div>
            </div>

            {/* Short Recipient Delivery Receipts */}
            <div className="pt-3">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-2">
                <span>Recipient Receipts</span>
                <span>{selectedCampaign.recipients.length} total</span>
              </div>
              <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {selectedCampaign.recipients.map((r) => (
                  <div key={r.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-900 truncate">{r.customer_name}</div>
                      <div className="text-[11px] text-slate-500">{formatPhone(r.phone_no)}</div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] shrink-0 ${
                        r.delivery_status === 'Delivered'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {r.delivery_status === 'Delivered' ? (
                        <CheckCircle2 size={10} />
                      ) : (
                        <XCircle size={10} />
                      )}
                      {r.delivery_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                className="btn btn-brand btn-sm"
                onClick={() => setSelectedCampaign(null)}
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
