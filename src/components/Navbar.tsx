import { useState } from 'react';
import { AlertTriangle, Cake } from 'lucide-react';
import type { NavTab } from '../types';
import { BRAND_LOGO_URL } from '../utils/formatters';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  urgentBirthdaysCount: number;
  highAlertsCount: number;
  historyCount: number;
}

export function Navbar({
  activeTab,
  onSelectTab,
  urgentBirthdaysCount,
  highAlertsCount,
  historyCount,
}: NavbarProps) {
  const [logoError, setLogoError] = useState(false);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="brand">
          {!logoError ? (
            <img
              src={BRAND_LOGO_URL}
              alt="Mother's Hut Logo"
              className="brand-logo-img"
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div
              className="brand-logo-img flex items-center justify-center font-bold text-white text-xs"
              style={{ background: 'var(--brand)' }}
            >
              MH
            </div>
          )}
          <div className="brand-text-group">
            <span className="brand-name">Mother&apos;s Hut</span>
            <span className="brand-sub">
              Customer Grouping &amp; Marketing Strategy Manager
            </span>
          </div>
        </div>

        <nav className="nav-pill-bar" aria-label="Primary Navigation">
          <button
            type="button"
            className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => onSelectTab('overview')}
          >
            Overview
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === 'segments' ? 'active' : ''}`}
            onClick={() => onSelectTab('segments')}
          >
            Guest Groups and Message
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === 'segmentation' ? 'active' : ''}`}
            onClick={() => onSelectTab('segmentation')}
          >
            Group Profiles
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => onSelectTab('customers')}
          >
            Customers
          </button>

          <button
            type="button"
            className={`nav-tab nav-tab-birthday ${activeTab === 'birthday' ? 'active' : ''}`}
            onClick={() => onSelectTab('birthday')}
          >
            <Cake size={14} aria-hidden="true" />
            BIRTHDAY
            <span className="nav-badge nav-badge-amber">{urgentBirthdaysCount}</span>
          </button>

          <button
            type="button"
            className={`nav-tab nav-tab-alert ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => onSelectTab('alerts')}
          >
            <AlertTriangle size={14} aria-hidden="true" />
            Alert
            <span className="nav-badge nav-badge-red">{highAlertsCount}</span>
          </button>

          <button
            type="button"
            className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => onSelectTab('history')}
          >
            History <span className="nav-badge">{historyCount}</span>
          </button>
        </nav>
      </div>
    </header>
  );
}