import { useEffect, useState, useCallback } from "react";
import type { ResultData } from "../App";
import SplatViewer from "./SplatViewer";

interface ResultViewerProps {
  result: ResultData;
  apiUrl: string;
}

export default function ResultViewer({ result, apiUrl }: ResultViewerProps) {
  const [plyData, setPlyData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const plyPath = result.gaussiansPly;
  const fileUrl = `${apiUrl}/runs/${result.runId}/file?path=${encodeURIComponent(plyPath)}`;
  const antimatterUrl = `https://antimatter15.com/splat/?url=${encodeURIComponent(fileUrl)}`;

  const fetchPly = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlyData(null);

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const resp = await fetch(fileUrl);
        if (resp.status === 404 && attempt < 9) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        if (!resp.ok) throw new Error(`Failed to fetch PLY (${resp.status})`);
        const buf = await resp.arrayBuffer();
        setPlyData(new Uint8Array(buf));
        setLoading(false);
        return;
      } catch (err) {
        if (attempt < 9) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        setError((err as Error).message || "Failed to load 3D model");
      }
    }
    setLoading(false);
  }, [fileUrl]);

  useEffect(() => { fetchPly(); }, [fetchPly]);

  return (
    <div className="result-card">
      <button className="result-card-header" onClick={() => setCollapsed((c) => !c)}>
        <span className="result-card-title">3D World</span>
        <div className="result-card-actions" onClick={(e) => e.stopPropagation()}>
          <a href={fileUrl} className="result-link">Download PLY</a>
          <a href={antimatterUrl} target="_blank" rel="noreferrer" className="result-link">
            Open in viewer ↗
          </a>
        </div>
        <span className="result-collapse-icon">{collapsed ? "+" : "−"}</span>
      </button>

      {!collapsed && (
        <div className="result-splat-body">
          {loading && (
            <div className="splat-loading">
              <span className="spinner" />
              <span>Loading 3D model...</span>
            </div>
          )}
          {error && (
            <div className="splat-error">
              <span>{error}</span>
              <button className="retry-btn" onClick={fetchPly}>Retry</button>
            </div>
          )}
          {!loading && !error && (
            <SplatViewer fileData={plyData} fileName={plyPath} />
          )}
        </div>
      )}
    </div>
  );
}
