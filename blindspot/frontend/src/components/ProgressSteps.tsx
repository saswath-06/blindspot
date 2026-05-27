import type { StepInfo } from "../App";

export interface StepLabel {
  key: string;
  label: string;
}

interface ProgressStepsProps {
  steps: Record<string, StepInfo>;
  stepLabels: StepLabel[];
}

export default function ProgressSteps({ steps, stepLabels }: ProgressStepsProps) {
  return (
    <div className="pipeline-status">
      <div className="pipeline-header">Pipeline</div>
      <div className="pipeline-steps">
        {stepLabels.map((s, i) => {
          const info = steps[s.key] ?? { state: "pending", detail: "" };
          return (
            <div key={s.key} className={`pipeline-step ${info.state}`}>
              <div className="step-indicator">
                {info.state === "active"  && <span className="step-spinner-sm" />}
                {info.state === "done"    && <span className="step-done-dot" />}
                {info.state === "error"   && <span className="step-error-dot" />}
                {info.state === "pending" && <span className="step-pending-dot" />}
              </div>
              <div className="step-content">
                <div className="step-row">
                  <span className="step-num">{i + 1}</span>
                  <span className="step-label">{s.label}</span>
                  <span className={`step-badge ${info.state}`}>
                    {info.state === "active"  ? "running" :
                     info.state === "done"    ? "done"    :
                     info.state === "error"   ? "error"   : "—"}
                  </span>
                </div>
                {info.detail && (
                  <div className="step-detail">{info.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
