import { useState, useCallback, useRef, useEffect } from "react";
import TabSelector from "./components/TabSelector";
import PromptInput from "./components/PromptInput";
import GenerateButton from "./components/GenerateButton";
import ProgressSteps from "./components/ProgressSteps";
import type { StepLabel } from "./components/ProgressSteps";
import VideoPreview from "./components/VideoPreview";
import DebugPanel from "./components/DebugPanel";
import ResultViewer from "./components/ResultViewer";
import MetricsDashboard from "./components/MetricsDashboard";

const API_URL = import.meta.env.VITE_API_URL || "";
const CACHE_KEY = "blindspot-cache";

export type Category = "autonomous" | "humanoid";
export type StepState = "pending" | "active" | "done" | "error";

const TEXT_STEP_LABELS: StepLabel[] = [
  { key: "expand",    label: "Expand prompt with Gemini" },
  { key: "video",     label: "Generate video with Veo 3.1" },
  { key: "world",     label: "Build 3D world" },
  { key: "detection", label: "Baseline YOLOv8 detection" },
  { key: "finetune",  label: "Fine-tune on failure cases" },
  { key: "eval",      label: "Measure improvement" },
];

const UPLOAD_STEP_LABELS: StepLabel[] = [
  { key: "upload", label: "Process uploaded files" },
  { key: "world",  label: "Build 3D world" },
];

export interface StepInfo {
  state: StepState;
  detail: string;
}

export interface DebugData {
  originalPrompt: string;
  expandedPrompt: string;
  videoUrl: string;
  files: string[];
  runId: string;
}

export interface ResultData {
  runId: string;
  gaussiansPly: string;
}

export interface MetricsData {
  before_confidence: number;
  after_confidence: number;
  improvement: number;
  miss_rate_before: number | null;
  miss_rate_after: number | null;
  false_negatives_after: number;
  epochs: number;
}

interface CachedState {
  steps: Record<string, StepInfo>;
  showProgress: boolean;
  debugData: DebugData;
  hasDebugData: boolean;
  result: ResultData | null;
  metrics: MetricsData | null;
  videoCollapsed: boolean;
}

function loadCache(): CachedState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedState;
  } catch {
    return null;
  }
}

function saveCache(state: CachedState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {}
}

const INITIAL_TEXT_STEPS: Record<string, StepInfo> = {
  expand:    { state: "pending", detail: "" },
  video:     { state: "pending", detail: "" },
  world:     { state: "pending", detail: "" },
  detection: { state: "pending", detail: "" },
  finetune:  { state: "pending", detail: "" },
  eval:      { state: "pending", detail: "" },
};

const PIPELINE_NODES = [
  "Describe edge case",
  "Generate video",
  "3D reconstruct",
  "Detect failures",
  "Fine-tune",
  "Measure",
];

export default function App() {
  const cached = useRef(loadCache());

  const [category, setCategory] = useState<Category>("autonomous");
  const [prompt, setPrompt] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [debugMode, setDebugMode] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [steps, setSteps] = useState<Record<string, StepInfo>>(
    cached.current?.steps ?? INITIAL_TEXT_STEPS
  );
  const [showProgress, setShowProgress] = useState(cached.current?.showProgress ?? false);
  const [debugData, setDebugData] = useState<DebugData>(
    cached.current?.debugData ?? {
      originalPrompt: "", expandedPrompt: "", videoUrl: "", files: [], runId: "",
    }
  );
  const [hasDebugData, setHasDebugData] = useState(cached.current?.hasDebugData ?? false);
  const [result, setResult] = useState<ResultData | null>(cached.current?.result ?? null);
  const [metrics, setMetrics] = useState<MetricsData | null>(cached.current?.metrics ?? null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [videoCollapsed, setVideoCollapsed] = useState(cached.current?.videoCollapsed ?? true);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    saveCache({ steps, showProgress, debugData, hasDebugData, result, metrics, videoCollapsed });
  }, [steps, showProgress, debugData, hasDebugData, result, metrics, videoCollapsed]);

  const setStepState = useCallback((step: string, state: StepState, detail?: string) => {
    setSteps((prev) => ({
      ...prev,
      [step]: { state, detail: detail ?? (prev[step]?.detail ?? "") },
    }));
  }, []);

  const generate = useCallback(async () => {
    const hasFiles = uploadFiles.length > 0;
    if (!hasFiles && !prompt.trim()) return;
    if (generating) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setShowProgress(true);
    setResult(null);
    setMetrics(null);
    setStreamError(null);
    setHasDebugData(false);
    setVideoCollapsed(true);

    const freshDebug: DebugData = {
      originalPrompt: "", expandedPrompt: "", videoUrl: "", files: [], runId: "",
    };

    if (hasFiles) {
      setSteps({ upload: { state: "active", detail: "" }, world: { state: "pending", detail: "" } });
      setDebugData(freshDebug);
    } else {
      setSteps({ ...INITIAL_TEXT_STEPS });
      setDebugData({ ...freshDebug, originalPrompt: prompt });
    }

    try {
      let resp: Response;
      if (hasFiles) {
        const formData = new FormData();
        uploadFiles.forEach((f) => formData.append("files", f));
        resp = await fetch(`${API_URL}/upload`, {
          method: "POST", body: formData, signal: controller.signal,
        });
      } else {
        resp = await fetch(`${API_URL}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, category }),
          signal: controller.signal,
        });
      }

      if (!resp.ok) throw new Error(`Server error: ${resp.status} ${resp.statusText}`);
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try { handleEvent(JSON.parse(line.slice(6))); } catch {}
          }
        }
      }
      if (buffer.startsWith("data: ")) {
        try { handleEvent(JSON.parse(buffer.slice(6))); } catch {}
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message = (err as Error).message || "Connection failed";
      setStreamError(message);
      setSteps((prev) => {
        const next = { ...prev };
        let foundActive = false;
        for (const key of Object.keys(next)) {
          if (next[key].state === "active") {
            next[key] = { state: "error", detail: message };
            foundActive = true;
          }
        }
        if (!foundActive) {
          const firstKey = Object.keys(next)[0];
          if (firstKey) next[firstKey] = { state: "error", detail: message };
        }
        return next;
      });
    }

    setGenerating(false);
  }, [prompt, category, uploadFiles, generating]);

  function handleEvent(data: Record<string, unknown>) {
    const step = data.step as string;

    if (step === "upload_done") {
      const fileCount = (data.file_count as number) || 0;
      setStepState("upload", "done", `${fileCount} file${fileCount !== 1 ? "s" : ""} ready`);
      setDebugData((prev) => ({ ...prev, runId: (data.run_id as string) || "" }));
      setHasDebugData(true);
    }
    if (step === "expand_start") setStepState("expand", "active");
    if (step === "expand_done") {
      const expanded = (data.expanded_prompt as string) || "";
      setStepState("expand", "done", expanded.slice(0, 100) + "...");
      setDebugData((prev) => ({ ...prev, expandedPrompt: expanded }));
      setHasDebugData(true);
    }
    if (step === "video_start") setStepState("video", "active");
    if (step === "video_polling") setStepState("video", "active", `${data.elapsed || 0}s elapsed`);
    if (step === "video_done") {
      const runId = data.run_id as string;
      setStepState("video", "done");
      setDebugData((prev) => ({
        ...prev, runId,
        videoUrl: `${API_URL}/runs/${runId}/file?path=generated_video.mp4`,
      }));
    }
    if (step === "world_start") setStepState("world", "active");
    if (step === "world_done") {
      setStepState("world", "done");
      const runId = data.run_id as string;
      const files = (data.files as string[]) || [];
      const gaussiansPly = (data.gaussians_ply as string) || "gaussians.ply";
      setDebugData((prev) => ({ ...prev, runId, files }));
      setResult({ runId, gaussiansPly });
      setStreamError(null);
      setStepState("detection", "active");
    }
    if (step === "detection_start") setStepState("detection", "active");
    if (step === "detection_done") {
      const missRate = (data.miss_rate as number) ?? 0;
      setStepState("detection", "done", `${(missRate * 100).toFixed(0)}% miss rate`);
      setStepState("finetune", "active");
    }
    if (step === "finetune_start") setStepState("finetune", "active");
    if (step === "eval_done") {
      setStepState("finetune", "done");
      setStepState("eval", "done");
      setMetrics({
        before_confidence: (data.before_confidence as number) ?? 0,
        after_confidence:  (data.after_confidence as number) ?? 0,
        improvement:       (data.improvement as number) ?? 0,
        miss_rate_before:  (data.miss_rate_before as number | null) ?? null,
        miss_rate_after:   (data.miss_rate_after as number | null) ?? null,
        false_negatives_after: (data.false_negatives_after as number) ?? 0,
        epochs: (data.epochs as number) ?? 20,
      });
      setStreamError(null);
    }
    if (step === "error") {
      const message = (data.message as string) || "Failed";
      setStreamError(message);
      setSteps((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key].state === "active") next[key] = { state: "error", detail: message };
        }
        return next;
      });
    }
  }

  const handleNewRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setCategory("autonomous");
    setPrompt("");
    setUploadFiles([]);
    setGenerating(false);
    setSteps({ ...INITIAL_TEXT_STEPS });
    setShowProgress(false);
    setDebugData({ originalPrompt: "", expandedPrompt: "", videoUrl: "", files: [], runId: "" });
    setHasDebugData(false);
    setResult(null);
    setMetrics(null);
    setStreamError(null);
    setVideoCollapsed(true);
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }, []);

  const hasOutput = showProgress || result || metrics;
  const stepLabels = uploadFiles.length > 0 ? UPLOAD_STEP_LABELS : TEXT_STEP_LABELS;

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-name">Blindspot</span>
          <span className="brand-tag">Find where your model fails. Fix it.</span>
        </div>

        <div className="sidebar-body">
          <TabSelector category={category} onSelect={setCategory} />
          <PromptInput
            category={category}
            prompt={prompt}
            onPromptChange={setPrompt}
            files={uploadFiles}
            onFilesChange={setUploadFiles}
          />
          <GenerateButton
            generating={generating}
            disabled={uploadFiles.length === 0 && !prompt.trim()}
            onClick={generate}
          />
        </div>

        <div className="sidebar-footer">
          {hasOutput && (
            <button className="new-run-btn" onClick={handleNewRun}>
              + New run
            </button>
          )}
          <button
            className={`debug-toggle${debugMode ? " active" : ""}`}
            onClick={() => setDebugMode((d) => !d)}
          >
            Debug
          </button>
        </div>
      </aside>

      <main className="main-panel">
        {!hasOutput ? (
          <div className="empty-state">
            <div className="pipeline-diagram">
              {PIPELINE_NODES.map((label, i, arr) => (
                <span key={label} className="diagram-node">
                  <span className="diagram-label">{label}</span>
                  {i < arr.length - 1 && <span className="diagram-arrow">→</span>}
                </span>
              ))}
            </div>
            <p className="empty-hint">Enter a scenario in the sidebar to begin the loop.</p>
          </div>
        ) : (
          <div className="run-output">
            {showProgress && (
              <ProgressSteps steps={steps} stepLabels={stepLabels} />
            )}

            {streamError && !generating && (
              <div className="stream-error">
                <span className="error-icon">!</span>
                <span>{streamError}</span>
                <button
                  className="retry-btn"
                  onClick={() => { setStreamError(null); generate(); }}
                >
                  Retry
                </button>
              </div>
            )}

            {debugData.videoUrl && (
              <VideoPreview
                videoUrl={debugData.videoUrl}
                collapsed={videoCollapsed}
                onToggleCollapse={() => setVideoCollapsed((c) => !c)}
              />
            )}

            {debugMode && hasDebugData && (
              <DebugPanel debugData={debugData} apiUrl={API_URL} />
            )}

            {metrics && <MetricsDashboard {...metrics} />}
            {result && <ResultViewer result={result} apiUrl={API_URL} />}
          </div>
        )}
      </main>
    </div>
  );
}
