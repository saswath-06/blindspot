import type { MetricsData } from "../App";

export default function MetricsDashboard({
  before_confidence,
  after_confidence,
  improvement,
  miss_rate_before,
  miss_rate_after,
  false_negatives_after,
}: MetricsData) {
  const beforePct = Math.round(before_confidence * 100);
  const afterPct  = Math.round(after_confidence * 100);
  const deltaPct  = Math.round(improvement * 100);
  const missBeforePct = miss_rate_before != null ? Math.round(miss_rate_before * 100) : null;
  const missAfterPct  = miss_rate_after  != null ? Math.round(miss_rate_after  * 100) : null;

  return (
    <div className="metrics-dashboard">
      <div className="metrics-header">
        <span className="metrics-title">Confidence Delta</span>
        <span className={`metrics-delta ${deltaPct >= 0 ? "positive" : "negative"}`}>
          {deltaPct >= 0 ? "+" : ""}{deltaPct}%
        </span>
      </div>

      <div className="metrics-bars">
        <div className="metrics-col">
          <div className="metrics-label">Before fine-tune</div>
          <div className="bar-track">
            <div
              className="bar-fill bar-before"
              style={{ width: `${Math.min(beforePct, 100)}%` }}
            />
          </div>
          <div className="metrics-pct">{beforePct}%</div>
        </div>

        <div className="metrics-col">
          <div className="metrics-label">After fine-tune</div>
          <div className="bar-track">
            <div
              className="bar-fill bar-after"
              style={{ width: `${Math.min(afterPct, 100)}%` }}
            />
          </div>
          <div className="metrics-pct">{afterPct}%</div>
        </div>
      </div>

      <div className="metrics-stats">
        {missBeforePct != null && (
          <div className="metrics-stat">
            <span className="stat-label">Miss rate</span>
            <span className="stat-value">
              {missBeforePct}%
              {missAfterPct != null && (
                <> → <span className="stat-improved">{missAfterPct}%</span></>
              )}
            </span>
          </div>
        )}
        <div className="metrics-stat">
          <span className="stat-label">False negatives after</span>
          <span className={`stat-value ${false_negatives_after === 0 ? "stat-zero" : ""}`}>
            {false_negatives_after}
          </span>
        </div>
      </div>
    </div>
  );
}
