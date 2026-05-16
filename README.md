# Chess Vision Recorder

Real-time chess game recorder using an ESP32-CAM stream, YOLOv8 detection, perspective warping, move legality checks, PGN export, and optional Supabase persistence.

This repository is designed for:
- **Live board capture** from ESP32-CAM MJPEG stream
- **Board understanding** (corner detection + piece detection)
- **Game reconstruction** (FEN smoothing + legal move parsing with `python-chess`)
- **Export + storage** (PGN files locally, optional Supabase insert)

---

## 1) Current Project Structure

```text
Chess-YOKOv8-vision/
├── code/
│   ├── esp32_cam_stream.ino      # ESP32-CAM firmware (MJPEG /stream)
│   ├── train_models.py           # trains pieces + corners models
│   └── view_esp32_stream.py      # quick stream viewer
├── datasets/
│   ├── Chess_Pieces.yolov8/
│   └── Chessboard_detection-4Corners.yolov8/
├── exports/                      # PGN output and failure archives
├── models/                       # final model weights copied here
├── src/
│   ├── stream.py
│   ├── corners.py
│   ├── warp.py
│   ├── pieces.py
│   ├── fen.py
│   ├── validator.py
│   ├── smoother.py
│   ├── move_recorder.py
│   ├── pgn_exporter.py
│   ├── supabase_client.py
│   ├── display.py
│   ├── pipeline.py
│   ├── settings.py
│   ├── errors.py
│   └── types.py
├── tests/
├── config.yaml
├── .env.example
├── requirements.txt
└── main.py
```

---

## 2) How It Works (High-Level)

Per frame:
1. Read frame from ESP32 MJPEG stream.
2. Optionally rotate frame 180 in software (`config.yaml`).
3. Detect board corners (YOLO corners model).
4. Warp to top-down board view.
5. Detect pieces (YOLO pieces model) and map to board squares.
6. Build FEN from mapped board.
7. Validate position legality.
8. Smooth FEN over a temporal window.
9. If stable FEN changed, parse legal move and append to game.
10. Render two OpenCV windows: raw feed + warped board view.

Game end:
1. Export PGN to `exports/`.
2. Attempt Supabase insert.
3. If Supabase fails, save fallback payload in `exports/failures/`.

---

## 3) Requirements

- Windows 10/11 (or Linux/macOS)
- Python **3.12** recommended in this repo currently
- NVIDIA GPU supported (tested with RTX 4070 Laptop GPU)
- ESP32-CAM (AI Thinker pinout in firmware)

Python dependencies are in `requirements.txt`.

---

## 4) Environment Setup

From repository root (PowerShell):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install --index-url https://download.pytorch.org/whl/cu121 torch torchvision torchaudio
python -m pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_publishable_or_service_key
```

Verify CUDA:

```powershell
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.version.cuda); print(torch.cuda.get_device_name(0))"
```

---

## 5) ESP32-CAM Firmware Setup

File: `code/esp32_cam_stream.ino`

1. Open in Arduino IDE.
2. Set:
   - `WIFI_SSID`
   - `WIFI_PASSWORD`
3. Set board to **AI Thinker ESP32-CAM**.
4. Upload.
5. Open Serial Monitor and read stream URL:
   - `http://<esp32-ip>:81/stream`

### Rotation on ESP

Firmware includes:

```cpp
const bool ROTATE_180 = true;
```

If your camera is physically upside down, keep this `true`.

---

## 6) Config File

File: `config.yaml`

Important keys:
- `esp32_url`: MJPEG endpoint
- `corner_model_path`: `models/corners.pt`
- `piece_model_path`: `models/pieces.pt`
- `corner_conf`, `piece_conf`: detection confidence thresholds
- `smoothing_frames`: temporal FEN window
- `warp_size`: board warp output size (divisible by 8)
- `rotate_180`: software 180-degree rotation fallback
- display toggles:
  - `show_square_labels`
  - `show_confidence_scores`
  - `show_piece_count_hud`
  - `highlight_last_move`

---

## 7) Training Models

File: `code/train_models.py`

### Dataset sources used

- Corners dataset: [Roboflow Universe - Chessboard detection (4 corners)](https://universe.roboflow.com/chessboarddetection/chessboard-detection-4-corners)
- Pieces dataset: [Roboflow Project - Chess Full (jay-tmdyh)](https://app.roboflow.com/jay-tmdyh/chess-full-cnkvv/browse?queryText=&pageSize=50&startingIndex=0&browseQuery=true)

What the script does:
- Detects dataset yaml recursively under `datasets/**/data.yaml`
- Matches naming variants (spaces/underscores/case-insensitive)
- Auto-fixes Roboflow path issues:
  - creates `data.autofix.yaml` with absolute paths
  - falls back `val -> train` when val set is missing
- Trains both:
  - pieces model
  - corners model
- Copies best weights to:
  - `models/pieces.pt`
  - `models/corners.pt`

Run:

```powershell
.\.venv\Scripts\python code/train_models.py
```

### Current memory-safe training defaults

To avoid Windows pagefile/multiprocessing crashes, script uses:
- `workers=0`
- `cache=False`
- `batch=8`
- `imgsz=800`

These are intentional stability defaults for your environment.

### If only `pieces.pt` exists and `corners.pt` is missing

This means pieces training completed but corners training did not finish/copy successfully.
In that case, run corners-only training:

```powershell
.\.venv\Scripts\python -c "import runpy; ns=runpy.run_path('code/train_models.py'); ns['train_corners'](device=0)"
```

Then verify:

```powershell
ls models
```

You should have both `models/pieces.pt` and `models/corners.pt` before running `main.py`.

---

## 8) Running the App

```powershell
.\.venv\Scripts\python main.py
```

Optional auto-start game:

```powershell
.\.venv\Scripts\python main.py --start
```

Startup prompt:
- `Is white playing from bottom? (y/n)`

OpenCV windows:
- `Chess Vision` (raw stream + HUD/corners)
- `Board View` (warped board + overlays)

Keyboard controls:
- `s` start game
- `e` end game (prompts result)
- `r` resign (prompts side)
- `a` abort game (no save)
- `q` quit

---

## 9) Supabase

Module: `src/supabase_client.py`

Behavior:
- Validates payload before insert
- Inserts into `games` table
- If insert fails:
  - writes fallback JSON payload to `exports/failures/`
  - raises `SupabaseInsertError`

Gameplay is designed to keep local PGN as source-of-truth.

---

## 10) Core Modules and Responsibilities

- `src/stream.py`  
  ESP32 URL validation, reachability check, frame validation, retry/backoff.

- `src/corners.py`  
  Corner model inference, confidence filtering, sorting, convex/area/bounds checks.

- `src/warp.py`  
  Perspective transform validation and top-down board generation.

- `src/pieces.py`  
  Piece detection, label normalization, board mapping, plausibility checks.

- `src/fen.py`  
  Converts board map to complete FEN with strict rank/key/value validation.

- `src/validator.py`  
  Legal position checks via `python-chess`.

- `src/smoother.py`  
  Temporal consensus over recent FENs.

- `src/move_recorder.py`  
  Legal move matching from stable FEN changes, SAN/UCI tracking.

- `src/pgn_exporter.py`  
  Builds and writes PGN, validates output file.

- `src/display.py`  
  All rendering logic (HUD, boxes, labels, highlights, board grid).

- `src/pipeline.py`  
  End-to-end orchestration and runtime state machine.

---

## 11) Tests

Run tests:

```powershell
.\.venv\Scripts\python -m pytest -q
```

Current suite covers:
- stream validation
- corner logic
- warp checks
- piece mapping/plausibility
- FEN generation
- legality validation
- smoothing behavior
- move recorder scenarios
- PGN exporter
- Supabase fallback
- display output shape/behavior

---

## 12) Troubleshooting

### A) `CUDA is not available`
- Ensure CUDA wheel installed in `.venv`:
  - `torch==...+cu121`
- Re-check with `torch.cuda.is_available()`

### B) `Torch not compiled with CUDA enabled`
- You installed CPU-only torch.
- Reinstall torch from CUDA index URL.

### C) `WinError 1455 ... cublas64_12.dll`
- Windows pagefile too small during worker spawn.
- Current script mitigates with `workers=0` and `cache=False`.
- Also keep machine awake during training.

### D) `images not found` from Ultralytics
- Dataset path mismatch in Roboflow export.
- Script now auto-fixes yaml paths and folder naming variants.

### E) Repeated `corrupt JPEG restored and saved`
- Common with Roboflow-exported images.
- Ultralytics is repairing them; warning is usually non-fatal.

### F) Training seems stuck
- Wait for first epoch logs after dataset scan.
- Watch GPU usage in Task Manager.
- Ensure terminal is still producing output.

---

## 13) Operational Notes

- Keep `.venv/` out of git (already ignored).
- Keep `.env` private.
- Ensure `models/corners.pt` and `models/pieces.pt` exist before `main.py`.
- For best move quality, use stable camera mount and consistent board lighting.

---

## 14) Quick Start (Minimal)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install --index-url https://download.pytorch.org/whl/cu121 torch torchvision torchaudio
python -m pip install -r requirements.txt
copy .env.example .env
python code/train_models.py
python main.py
```

