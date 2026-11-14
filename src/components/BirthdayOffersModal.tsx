import { useState } from 'react';
import { Check, Gift, Plus, Trash2 } from 'lucide-react';
import type { BirthdayOffer } from '../types';
import { formatINR } from '../utils/formatters';

interface BirthdayOffersModalProps {
  isOpen: boolean;
  offers: BirthdayOffer[];
  onClose: () => void;
  onSaveOffer: (payload: Partial<BirthdayOffer> & { title: string; discount_or_benefit: string }) => Promise<void>;
  onDeleteOffer: (id: string) => Promise<void>;
}

export function BirthdayOffersModal({
  isOpen,
  offers,
  onClose,
  onSaveOffer,
  onDeleteOffer,
}: BirthdayOffersModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [applicable, setApplicable] = useState('All');
  const [benefit, setBenefit] = useState('');
  const [validityDays, setValidityDays] = useState(7);
  const [minOrder, setMinOrder] = useState(500);
  const [terms, setTerms] = useState('Valid once for dine-in birthday celebrations.');
  const [isActive, setIsActive] = useState(true);
  const [ownerApproved, setOwnerApproved] = useState(true);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !benefit.trim()) return;
    setSaving(true);
    try {
      await onSaveOffer({
        title,
        description: description || benefit,
        applicable_item_or_category: applicable,
        discount_or_benefit: benefit,
        validity_days: validityDays,
        min_order_amount_inr: minOrder,
        terms_and_conditions: terms,
        is_active: isActive,
        owner_approved: ownerApproved,
      });
      setTitle('');
      setDescription('');
      setBenefit('');
    } finally {
      setSaving(false);
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
      <div className="modal-card" style={{ maxWidth: 880 }}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>

        <div className="flex items-center gap-3 mb-4 pr-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{ background: 'var(--brand)' }}
          >
            <Gift size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Birthday Offer Management</h2>
            <p className="text-xs text-slate-500">
              Only active &amp; owner-approved offers appear in Personalized Birthday SMS Option 2. Kept separate from cluster offers.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Existing Offers */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Configured Birthday Offers ({offers.length})
            </h3>
            {offers.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-xs text-slate-500 text-center">
                No birthday offers configured. Birthday SMS Option 2 will use a polite celebration invite with no discounts.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {offers.map((o) => (
                  <div
                    key={o.id}
                    className={`rounded-xl border p-3.5 text-xs ${
                      o.is_active && o.owner_approved
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-semibold text-zinc-900">{o.title}</div>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                        title="Delete Offer"
                        onClick={() => onDeleteOffer(o.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="text-slate-600 mb-2">{o.description}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 mb-2.5">
                      <span>Item/Category: <strong>{o.applicable_item_or_category}</strong></span>
                      <span>Validity: <strong>{o.validity_days}d</strong></span>
                      <span>Min Order: <strong>{formatINR(o.min_order_amount_inr)}</strong></span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                      <span className="text-[11px] text-slate-500 truncate">{o.terms_and_conditions}</span>
                      <button
                        type="button"
                        className={`btn btn-sm ${o.is_active ? 'btn-emerald' : 'btn-outline'}`}
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() =>
                          onSaveOffer({
                            ...o,
                            is_active: !o.is_active,
                          })
                        }
                      >
                        {o.is_active ? (
                          <>
                            <Check size={12} /> Active &amp; Approved
                          </>
                        ) : (
                          'Activate'
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create New Birthday Offer */}
          <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
              <Plus size={14} /> Add Owner-Approved Birthday Offer
            </h3>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Offer Title *</label>
              <input
                type="text"
                required
                className="field-input w-full"
                placeholder="e.g., Complimentary Birthday Dessert + 10% Off"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Discount / Benefit Phrase (used in SMS) *
              </label>
              <input
                type="text"
                required
                className="field-input w-full"
                placeholder="e.g., a complimentary dessert and 10% OFF your bill"
                value={benefit}
                onChange={(e) => setBenefit(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Category / Dish</label>
                <input
                  type="text"
                  className="field-input w-full"
                  value={applicable}
                  onChange={(e) => setApplicable(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Valid Days</label>
                <input
                  type="number"
                  min={1}
                  className="field-input w-full"
                  value={validityDays}
                  onChange={(e) => setValidityDays(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Min Order (₹)</label>
                <input
                  type="number"
                  min={0}
                  className="field-input w-full"
                  value={minOrder}
                  onChange={(e) => setMinOrder(Number(e.target.value))}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Terms &amp; Conditions</label>
              <input
                type="text"
                className="field-input w-full"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ownerApproved}
                  onChange={(e) => setOwnerApproved(e.target.checked)}
                />
                Owner Approved
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active Now
              </label>
            </div>
            <button type="submit" disabled={saving} className="btn btn-brand btn-sm w-full">
              {saving ? 'Saving...' : 'Save Birthday Offer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
