import type { DashboardSnapshot } from '../types';
import { formatINR } from '../utils/formatters';

interface SegmentationPageProps {
  snapshot: DashboardSnapshot;
  onMessageGroup: (cid: number) => void;
}

export function SegmentationPage({ snapshot, onMessageGroup }: SegmentationPageProps) {
  const { cluster_profiles } = snapshot;

  return (
    <div className="tab-animate">
      <div className="hero-row">
        <div>
          <h1>Group Profiles</h1>
          <p className="hero-subtitle">
            Visit frequency, average spend, dining ratings, and priority alerts for each guest group.
          </p>
        </div>
      </div>

      <div className="profiles-grid">
        {cluster_profiles.map((s) => (
          <div key={s.cluster_id} className="surface-card profile-card" data-cluster={s.cluster_id}>
            <div className="profile-card-top">
              <div>
                <span className="profile-cluster-label">GROUP {s.cluster_id + 1} PROFILE</span>
                <h2>{s.cluster_name}</h2>
                <p className="profile-subtitle">{s.subtitle}</p>
              </div>
              <div className="group-size-badge">
                <span>Group Size</span>
                <strong>{s.customer_count.toLocaleString()}</strong>
              </div>
            </div>

            <p className="profile-body-desc">
              {s.cluster_name} average <strong>{formatINR(s.avg_total_spend_inr)}</strong> total
              spend ({formatINR(s.avg_spend_per_visit_inr)} per visit), rate{' '}
              <strong>{s.avg_rating.toFixed(2)} / 5</strong>, visit{' '}
              <strong>{s.avg_visits} times</strong>, and use offers on{' '}
              <strong>{s.discount_usage_pct}%</strong> of visits.
            </p>

            <div className="profile-tiles-grid">
              <div className="stat-tile">
                <span className="tile-label">Avg Visits</span>
                <strong className="tile-val">{s.avg_visits}</strong>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Avg Party Size</span>
                <strong className="tile-val">{s.avg_group_size}</strong>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Avg Rating</span>
                <strong className="tile-val text-amber">{s.avg_rating.toFixed(2)} / 5</strong>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Avg Total Spend</span>
                <strong className="tile-val">{formatINR(s.avg_total_spend_inr)}</strong>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Spend / Visit</span>
                <strong className="tile-val">{formatINR(s.avg_spend_per_visit_inr)}</strong>
              </div>
              <div className="stat-tile">
                <span className="tile-label">Avg Children</span>
                <strong className="tile-val">{s.avg_children.toFixed(2)}</strong>
              </div>
            </div>

            <div className="profile-footer-bar">
              <span>
                High Alerts: <strong className="text-red-dark">{s.high_alerts_count}</strong>
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm jump-cluster-btn"
                onClick={() => onMessageGroup(s.cluster_id)}
              >
                Message This Group →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}