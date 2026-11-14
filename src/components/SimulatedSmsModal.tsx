import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquare, ShieldAlert, XCircle } from 'lucide-react';
import type { CampaignRecord } from '../types';
import { formatPhone } from '../utils/formatters';

interface SimulatedSmsModalProps {
  isOpen: boolean;
  isSimulating: boolean;
  campaign: CampaignRecord | null;
  errorMessage: string | null;
  onClose: () => void;
}

export function SimulatedSmsModal({
  isOpen,
  isSimulating,
  campaign,
  errorMessage,
  onClose,
}: SimulatedSmsModalProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const stages = ['Pending', 'Queued', 'Sent', 'Updating Delivery Statuses'];

  useEffect(() => {
    if (!isOpen || !isSimulating) {
      setStageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setStageIndex((prev) => (prev < stages.length - 1 ? prev + 1 : prev));
    }, 320);
    return () => clearInterval(timer);
  }, [isOpen, isSimulating]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSimulating) onClose();
      }}
    >
      <div className="modal-card" style={{ maxWidth: 680 }}>
        {!isSimulating && (
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap mb-4 pr-8">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
              style={{ background: 'var(--brand)' }}
            >
              <MessageSquare size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">SMS Campaign Dispatch</h2>
              <p className="text-xs text-slate-500">SMS-Only Channel · Direct Guest Messaging</p>
            </div>
          </div>
        </div>

        {isSimulating && (
          <div className="surface-card p-6 text-center bg-slate-50">
            <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: 'var(--brand)' }} />
            <div className="text-sm font-semibold text-zinc-900 mb-1">
              Sending SMS Dispatch ({stages[stageIndex]}...)
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Queuing recipients and recording SMS delivery receipts in history.
            </p>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden mb-3">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${((stageIndex + 1) / stages.length) * 100}%`,
                  background: 'var(--brand)',
                }}
              />
            </div>
            <div className="flex justify-center gap-2 flex-wrap text-[11px] font-medium text-slate-600">
              {stages.map((s, idx) => (
                <span
                  key={s}
                  className={`px-2.5 py-0.5 rounded-full border ${
                    idx <= stageIndex
                      ? 'bg-white border-amber-300 text-zinc-900 font-semibold'
                      : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {!isSimulating && errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <ShieldAlert size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-900">Campaign Blocked / Failed</div>
              <p className="text-xs text-red-700 mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        {!isSimulating && campaign && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{campaign.campaign_name}</div>
                  <div className="text-xs text-slate-600">
                    Channel: <strong>SMS</strong> · Saved to persistent campaign history
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="stat-tile">
                <span className="tile-label">Recipients</span>
                <strong className="tile-val">{campaign.recipient_count}</strong>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Sent</span>
                <strong className="tile-val">{campaign.sent_count}</strong>
              </div>
              <div className="stat-tile" style={{ background: 'var(--green-soft)', borderColor: 'var(--green-border)' }}>
                <span className="tile-label">Delivered</span>
                <strong className="tile-val text-green">{campaign.delivered_count}</strong>
              </div>
              <div className="stat-tile tile-alert">
                <span className="tile-label">Failed</span>
                <strong className="tile-val text-red-dark">{campaign.failed_count}</strong>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 flex justify-between">
                <span>Recipient Delivery Results</span>
                <span>{campaign.recipients.length} records</span>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {campaign.recipients.map((r) => (
                  <div key={r.id} className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-900 truncate">{r.customer_name}</div>
                      <div className="text-slate-500">{formatPhone(r.phone_no)}</div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-[11px] shrink-0 ${
                        r.delivery_status === 'Delivered'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {r.delivery_status === 'Delivered' ? (
                        <CheckCircle2 size={11} />
                      ) : (
                        <XCircle size={11} />
                      )}
                      {r.delivery_status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" className="btn btn-brand btn-sm" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
