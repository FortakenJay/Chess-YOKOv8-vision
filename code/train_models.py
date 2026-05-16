"""Train both YOLOv8 models (corners + pieces) on local datasets.

Usage:
  python code/train_models.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

import torch
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
DATASETS_DIR = ROOT / "datasets"
MODELS_DIR = ROOT / "models"


def _resolve_dataset_yaml(candidates: list[str]) -> Path:
    for candidate in candidates:
        path = DATASETS_DIR / candidate / "data.yaml"
        if path.exists():
            return path
    raise FileNotFoundError(f"Could not find data.yaml in any candidate: {candidates}")


def _copy_best_weight(train_name: str, destination: Path) -> None:
    best = ROOT / "runs" / "train" / train_name / "weights" / "best.pt"
    if not best.exists():
        raise FileNotFoundError(f"Training finished but best weight missing: {best}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, destination)


def train_pieces(device: int = 0) -> None:
    pieces_yaml = _resolve_dataset_yaml(["Chess Pieces.yolov8"])
    model = YOLO("yolov8n.pt")
    model.train(
        data=str(pieces_yaml),
        epochs=120,
        imgsz=960,
        batch=16,
        device=device,
        workers=8,
        cache=True,
        patience=25,
        project=str(ROOT / "runs" / "train"),
        name="pieces",
        exist_ok=True,
    )
    _copy_best_weight("pieces", MODELS_DIR / "pieces.pt")


def train_corners(device: int = 0) -> None:
    corners_yaml = _resolve_dataset_yaml(
        [
            "Chessboard detection-4Corners.yolov8",
            "Chessboard detection - 4 Corners.yolov8",
        ]
    )
    model = YOLO("yolov8n.pt")
    model.train(
        data=str(corners_yaml),
        epochs=120,
        imgsz=960,
        batch=16,
        device=device,
        workers=8,
        cache=True,
        patience=25,
        project=str(ROOT / "runs" / "train"),
        name="corners",
        exist_ok=True,
    )
    _copy_best_weight("corners", MODELS_DIR / "corners.pt")


def main() -> None:
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is not available. For your RTX 4070, install CUDA-enabled PyTorch.")
    print(f"CUDA available: {torch.cuda.is_available()} | GPU: {torch.cuda.get_device_name(0)}")
    print("Training pieces model...")
    train_pieces(device=0)
    print("Training corners model...")
    train_corners(device=0)
    print("Done. Saved:")
    print(f"- {MODELS_DIR / 'pieces.pt'}")
    print(f"- {MODELS_DIR / 'corners.pt'}")


if __name__ == "__main__":
    main()

