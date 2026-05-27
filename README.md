# Blindspot

A closed-loop synthetic data and fine-tuning pipeline for autonomous perception models. Describe an edge case in plain English — Blindspot generates the scene, reconstructs it in 3D, runs detection, finds exactly where the model breaks, fine-tunes against those failures, and streams the before/after confidence improvement live.

---

## The Problem

Autonomous perception models fail silently on the long tail. A detector trained on clear-weather highway data will look at a hailstorm, return high confidence, and be completely wrong. The dangerous failures are not the ones the model flags as uncertain — they are the ones it is confident about and wrong on.

Collecting real footage of rare scenarios is slow, expensive, and sometimes physically impossible. Black ice, hailstorms, road debris, flooded streets — these conditions are chronically underrepresented in training datasets. The model keeps failing on exactly the cases that matter most, and there is no systematic way to close that gap.

---

## How It Works

### The Pipeline

```
Describe edge case → Generate video → 3D reconstruct → Detect failures → Fine-tune → Measure
```

**1. Describe the edge case**
Natural language input: "highway driving during a hailstorm with low visibility." No labeling, no data collection, no camera crew.

**2. Generate the scene**
Gemini expands the short prompt into a detailed cinematic description optimized for 3D reconstruction — orbital camera motion, static scene, high-frequency texture detail. Veo 3.1 generates a photorealistic 8-second video.

**3. Reconstruct in 3D**
HunyuanWorld-Mirror converts the video frames into a 3D Gaussian Splat. The 3D representation enables frame extraction from arbitrary viewpoints, giving more diverse training angles from a single generated video.

**4. Find the failures**
YOLOv8n (the small, fast model) runs baseline inference on 24 extracted frames. YOLOv8x runs as a teacher model to generate pseudo-ground-truth labels. The system compares the two using IoU matching to identify exactly which objects YOLOv8n missed and where.

**5. Fine-tune against the failures**
A YOLO dataset is assembled from the extracted frames and teacher labels. YOLOv8n is fine-tuned on this dataset for 20 epochs via the Ultralytics training API on a Modal A10G GPU, targeting the identified failure modes directly.

**6. Measure the fix**
The fine-tuned model re-runs inference on the same frames. Before and after confidence scores, miss rates, and false negative counts are computed and streamed live to the dashboard over Server-Sent Events.

### Why This Works

Most synthetic data pipelines hand you a folder of images and stop. The value is in the evaluation harness that connects generated data back to a measurable model improvement. Without that feedback loop, you are assuming the fine-tune worked. Blindspot proves it.

---

## Architecture

### Backend — `blindspot/modal_app.py`

A single Modal app with five functions:

| Function | Hardware | What it does |
|---|---|---|
| `expand_prompt` | CPU | Gemini 2.0-Flash expands short prompt into video-optimized description |
| `generate_video` | CPU | Veo 3.1 generates 8-second 720p video |
| `generate_world` | H100 | HunyuanWorld-Mirror converts video → Gaussian Splat (.ply) |
| `run_detection` | A10G | Frame extraction, YOLOv8n baseline, YOLOv8x teacher labeling, failure analysis |
| `finetune_model` | A10G | Dataset prep, fine-tuning, post-eval, metrics.json |
| `viewer` | CPU | FastAPI ASGI app serving all endpoints + SSE stream |

All pipeline steps stream progress to the frontend via Server-Sent Events. The full text pipeline emits: `expand_start` → `expand_done` → `video_start` → `video_done` → `world_start` → `world_done` → `detection_start` → `detection_done` → `finetune_start` → `eval_done`.

### Frontend — `blindspot/frontend/`

React 19 + TypeScript + Vite. Dashboard layout with a persistent sidebar (tab selector, prompt input, generate button) and a main panel showing the live pipeline monitor and results.

Key components:
- `ProgressSteps` — live 6-step pipeline status monitor with per-step state (pending / running / done / error)
- `MetricsDashboard` — before/after confidence bars, improvement delta, miss rate, false negative count
- `ResultViewer` — collapsible 3D Gaussian Splat viewer powered by Spark.js + Three.js

### Storage

Modal Volumes persist all artifacts under `/data/runs/{run_id}/`:

```
frames/           24 extracted JPEGs
labels/           YOLO-format .txt labels from teacher model (train/val split)
baseline_detections.json
failures.json
dataset/          YOLO dataset fed to fine-tuning
finetune/train/weights/best.pt
eval_detections.json
metrics.json
gaussians.ply
generated_video.mp4
meta.json
```

---

## Stack

| Layer | Tools |
|---|---|
| Prompt expansion | Gemini 2.0-Flash |
| Scene generation | Google Veo 3.1 |
| 3D reconstruction | HunyuanWorld-Mirror, Gaussian splatting |
| Compute | Modal (H100 for 3D, A10G for detection + fine-tuning) |
| Detection | YOLOv8n (student), YOLOv8x (teacher) |
| Fine-tuning | Ultralytics training API |
| Backend | FastAPI, Server-Sent Events |
| Frontend | React 19, TypeScript, Vite, Spark.js, Three.js |

---

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- Modal account — [modal.com](https://modal.com)
- Gemini API key with Veo 3 access — [aistudio.google.com](https://aistudio.google.com)

### 1. Install Modal

```bash
pip install modal
python -m modal setup
```

### 2. Add your Gemini API key

```bash
python -m modal secret create gemini-api-key GEMINI_API_KEY=<your-key>
```

### 3. Deploy the backend

```bash
cd blindspot
python -m modal deploy modal_app.py
```

First deploy builds the GPU container image (~10 minutes). The deployed URL is printed at the end.

### 4. Configure the frontend

Create `blindspot/frontend/.env.development`:

```
VITE_API_URL=https://<your-modal-app>.modal.run
```

### 5. Run the frontend

```bash
cd blindspot/frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Usage

1. Select **Autonomous Driving** or **Humanoid Robots**
2. Describe an edge case — e.g. "highway driving during a hailstorm with low visibility"
3. Click **Run Pipeline**
4. Watch all 6 stages complete live
5. The metrics dashboard shows confidence before and after fine-tuning

The upload route (drag a video or images into the prompt box) skips Veo3 and goes straight to 3D reconstruction, which is useful if you already have footage.

---

## Project Structure

```
blindspot/
├── blindspot_README.md
└── blindspot/
    ├── modal_app.py          # Full backend pipeline
    └── frontend/
        ├── src/
        │   ├── App.tsx
        │   ├── App.css
        │   └── components/
        │       ├── ProgressSteps.tsx
        │       ├── MetricsDashboard.tsx
        │       ├── ResultViewer.tsx
        │       ├── TabSelector.tsx
        │       ├── PromptInput.tsx
        │       ├── GenerateButton.tsx
        │       ├── VideoPreview.tsx
        │       └── DebugPanel.tsx
        ├── package.json
        └── vite.config.ts
```
