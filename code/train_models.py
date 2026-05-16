"""Train both YOLOv8 models (corners + pieces) on local datasets.

Usage:
  python code/train_models.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

import torch
import yaml
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
DATASETS_DIR = ROOT / "datasets"
MODELS_DIR = ROOT / "models"


def _norm(text: str) -> str:
    return "".join(ch.lower() for ch in text if ch.isalnum())


def _resolve_dataset_yaml(candidates: list[str]) -> Path:
    all_yamls = list(DATASETS_DIR.glob("**/data.yaml"))
    if not all_yamls:
        raise FileNotFoundError(f"No data.yaml files found under: {DATASETS_DIR}")

    normalized_candidates = [_norm(c) for c in candidates]
    for yaml_path in all_yamls:
        parent_norm = _norm(str(yaml_path.parent))
        if any(candidate in parent_norm for candidate in normalized_candidates):
            return yaml_path

    raise FileNotFoundError(
        f"Could not match any dataset yaml for candidates={candidates}. "
        f"Found: {[str(p.parent) for p in all_yamls]}"
    )


def _copy_best_weight(train_name: str, destination: Path) -> None:
    best = ROOT / "runs" / "train" / train_name / "weights" / "best.pt"
    if not best.exists():
        raise FileNotFoundError(f"Training finished but best weight missing: {best}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, destination)


def _prepare_ultralytics_yaml(source_yaml: Path) -> Path:
    """Create a training YAML with absolute paths and train-only fallback."""
    data = yaml.safe_load(source_yaml.read_text(encoding="utf-8")) or {}
    dataset_root = source_yaml.parent

    train_rel = data.get("train", "train/images")
    val_rel = data.get("val", "valid/images")
    test_rel = data.get("test", "test/images")

    train_abs = (dataset_root / train_rel).resolve()
    val_abs = (dataset_root / val_rel).resolve()
    test_abs = (dataset_root / test_rel).resolve()

    # Some Roboflow exports place data.yaml in a folder where relative paths
    # use "../train/images", but local extraction may have "train/images" here.
    same_dir_train = (dataset_root / "train" / "images").resolve()
    same_dir_val = (dataset_root / "valid" / "images").resolve()
    same_dir_test = (dataset_root / "test" / "images").resolve()

    if not train_abs.exists() and same_dir_train.exists():
        train_abs = same_dir_train
    if not val_abs.exists() and same_dir_val.exists():
        val_abs = same_dir_val
    if not test_abs.exists() and same_dir_test.exists():
        test_abs = same_dir_test

    if not train_abs.exists():
        raise FileNotFoundError(f"Train images path missing: {train_abs}")

    if not val_abs.exists():
        print(f"[warn] Missing val path for {source_yaml.name}: {val_abs}")
        print("[warn] Falling back to train/images for validation.")
        val_abs = train_abs

    if not test_abs.exists():
        test_abs = val_abs

    fixed = {
        "path": str(dataset_root),
        "train": str(train_abs),
        "val": str(val_abs),
        "test": str(test_abs),
        "nc": data["nc"],
        "names": data["names"],
    }
    fixed_yaml = source_yaml.with_name("data.autofix.yaml")
    fixed_yaml.write_text(yaml.safe_dump(fixed, sort_keys=False), encoding="utf-8")
    return fixed_yaml


def train_pieces(device: int = 0) -> None:
    pieces_yaml = _prepare_ultralytics_yaml(
        _resolve_dataset_yaml(
            [
                "Chess Pieces.yolov8",
                "Chess_Pieces.yolov8",
                "chessPieces",
            ]
        )
    )
    model = YOLO("yolov8n.pt")
    model.train(
        data=str(pieces_yaml),
        epochs=120,
        imgsz=800,
        batch=8,
        device=device,
        workers=0,
        cache=False,
        patience=25,
        project=str(ROOT / "runs" / "train"),
        name="pieces",
        exist_ok=True,
    )
    _copy_best_weight("pieces", MODELS_DIR / "pieces.pt")


def train_corners(device: int = 0) -> None:
    corners_yaml = _prepare_ultralytics_yaml(
        _resolve_dataset_yaml(
            [
                "Chessboard detection-4Corners.yolov8",
                "Chessboard_detection-4Corners.yolov8",
                "Chessboard detection - 4 Corners.yolov8",
            ]
        )
    )
    model = YOLO("yolov8n.pt")
    model.train(
        data=str(corners_yaml),
        epochs=120,
        imgsz=800,
        batch=8,
        device=device,
        workers=0,
        cache=False,
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

