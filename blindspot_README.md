# Blindspot

**A closed-loop pipeline that finds where a perception model fails, then fixes it.**

Describe an edge case in plain English. Blindspot generates the scene, reconstructs it in 3D, runs detection on it, logs exactly where the model breaks, fine-tunes against those failures, and shows you the before and after confidence live.

---

## Problem

Autonomous perception models fail silently. A detector trained on clean data will look at an edge case it has never seen, return high confidence, and be completely wrong. The dangerous failures are not the ones the model flags as uncertain. They are the ones it is confident about and wrong on.

Collecting real footage of rare scenarios (black ice, hailstorms, road debris) is slow, expensive, and sometimes impossible to capture safely. So the long tail of driving conditions stays underrepresented in training data, and the model keeps failing on exactly the cases that matter most.

## Solution

Blindspot is a synthetic data and fine-tuning loop that targets failure modes directly instead of throwing more generic data at the problem.

1. **Describe the edge case.** Natural language input, for example "highway driving during a hailstorm with low visibility."
2. **Generate the scene.** Veo3 produces a photorealistic video of the described scenario.
3. **Reconstruct in 3D.** Gaussian splatting on RunPod H100 GPUs turns the video into a 3D world model so frames can be extracted from multiple viewpoints.
4. **Find the failures.** YOLOv8 runs inference on extracted frames and logs exactly where and how the model misses.
5. **Fine-tune against the failures.** The model is retrained on the generated edge case scenes targeting the identified failure modes via the Ultralytics training API.
6. **Measure the fix.** Before and after confidence scores stream live to a Next.js dashboard over a FastAPI plus SSE pipeline, with a real-time confidence delta visualization across the generation, reconstruction, and inference stages.

## Result

On a held-out hailstorm highway scenario, obstacle detection confidence improved from **31% to 87%** and false negatives dropped to **zero** after fine-tuning.

## The hardest part

Closing the loop. Most synthetic data pipelines hand you a folder of images and stop. The actual value is in the evaluation harness that connects generated data back to a measurable model improvement, so you can prove the fine-tune worked rather than assuming it did. That feedback loop, generation to detection to retraining to verified gain, is the core of the project.

## Stack

| Layer | Tools |
|---|---|
| Scene generation | Veo3 |
| 3D reconstruction | Gaussian splatting, RunPod H100 GPUs |
| Detection and fine-tuning | YOLOv8, Ultralytics training API |
| Backend and streaming | FastAPI, Server-Sent Events |
| Frontend | Next.js |

## Repo

https://github.com/saswath-06/blindspot
