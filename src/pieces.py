"""Piece detection and board mapping."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from .types import BoardMap, DetectedPiece

logger = logging.getLogger(__name__)

PIECE_TO_FEN: dict[str, str] = {
    "white-king": "K",
    "white-queen": "Q",
    "white-rook": "R",
    "white-bishop": "B",
    "white-knight": "N",
    "white-pawn": "P",
    "black-king": "k",
    "black-queen": "q",
    "black-rook": "r",
    "black-bishop": "b",
    "black-knight": "n",
    "black-pawn": "p",
}

ALIAS_LABELS: dict[str, str] = {
    "bishop": "white-bishop",
}


def _square_name(file_idx: int, rank_idx: int) -> str:
    return f"{chr(ord('a') + file_idx)}{8 - rank_idx}"


class PieceDetector:
    """Detect pieces in a warped board and map them to board squares."""

    def __init__(self, model_path: str, conf: float, warp_size: int, white_bottom: bool = True) -> None:
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Piece model not found: {model_path}")
        from ultralytics import YOLO  # lazy import for tests

        self.model = YOLO(model_path)
        self.conf = conf
        self.warp_size = warp_size
        self.white_bottom = white_bottom

    def detect(self, warped_frame: np.ndarray) -> list[DetectedPiece]:
        if warped_frame.shape[:2] != (self.warp_size, self.warp_size):
            raise ValueError("warped frame dimensions do not match warp_size")
        results = self.model.predict(source=warped_frame, conf=self.conf, verbose=False)
        if not results:
            return []
        result = results[0]
        if result.boxes is None:
            return []

        detections: list[DetectedPiece] = []
        names = result.names
        for i, xyxy in enumerate(result.boxes.xyxy.cpu().numpy()):
            conf = float(result.boxes.conf[i].item())
            class_id = int(result.boxes.cls[i].item())
            raw_label = str(names[class_id])
            label = ALIAS_LABELS.get(raw_label, raw_label)
            if label not in PIECE_TO_FEN:
                logger.warning("Skipping unknown class label: %s", raw_label)
                continue
            x1, y1, x2, y2 = [int(v) for v in xyxy]
            x1 = max(0, min(self.warp_size - 1, x1))
            y1 = max(0, min(self.warp_size - 1, y1))
            x2 = max(0, min(self.warp_size - 1, x2))
            y2 = max(0, min(self.warp_size - 1, y2))
            detections.append(DetectedPiece(label=label, confidence=conf, x1=x1, y1=y1, x2=x2, y2=y2))
        return detections

    def to_board_map(self, detections: list[DetectedPiece]) -> BoardMap | None:
        board_map: BoardMap = {}
        cell = self.warp_size // 8
        for det in detections:
            cx = (det.x1 + det.x2) / 2.0
            cy = (det.y1 + det.y2) / 2.0
            if not (0 <= cx < self.warp_size and 0 <= cy < self.warp_size):
                logger.warning("Skipping out-of-bounds detection for %s", det.label)
                continue
            file_idx = int(cx // cell)
            rank_idx = int(cy // cell)
            if not self.white_bottom:
                file_idx = 7 - file_idx
                rank_idx = 7 - rank_idx
            board_map[(rank_idx, file_idx)] = PIECE_TO_FEN[det.label]
            det.square = _square_name(file_idx, rank_idx)

        if not self._plausible(board_map):
            logger.warning("Discarding frame: physically implausible piece counts")
            return None
        return board_map

    @staticmethod
    def _plausible(board_map: BoardMap) -> bool:
        values = list(board_map.values())
        white = [v for v in values if v.isupper()]
        black = [v for v in values if v.islower()]

        if values.count("K") != 1 or values.count("k") != 1:
            return False
        if values.count("P") > 8 or values.count("p") > 8:
            return False
        if len(white) > 16 or len(black) > 16 or len(values) > 32:
            return False
        return True

