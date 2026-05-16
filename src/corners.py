"""Corner detection for chess board boundaries."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def _sort_corners(points: np.ndarray) -> np.ndarray:
    """Return corners ordered as TL, TR, BR, BL."""
    pts = points.astype(np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).reshape(-1)
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


class CornerDetector:
    """Detect and validate 4 board corners using a YOLO model."""

    def __init__(self, model_path: str, conf: float, min_area_px: int) -> None:
        if not Path(model_path).exists():
            raise FileNotFoundError(f"Corner model not found: {model_path}")
        from ultralytics import YOLO  # lazy import for easier tests

        self.model = YOLO(model_path)
        self.conf = conf
        self.min_area_px = min_area_px

    @staticmethod
    def _in_bounds(points: np.ndarray, width: int, height: int) -> bool:
        return bool(np.all(points[:, 0] >= 0) and np.all(points[:, 0] < width) and np.all(points[:, 1] >= 0) and np.all(points[:, 1] < height))

    @staticmethod
    def _is_convex(points: np.ndarray) -> bool:
        contour = points.reshape(-1, 1, 2).astype(np.float32)
        return bool(cv2.isContourConvex(contour))

    def detect(self, frame: np.ndarray) -> np.ndarray | None:
        """Return 4 validated corners or None if frame is unusable."""
        results = self.model.predict(source=frame, conf=self.conf, verbose=False)
        if not results:
            return None
        result = results[0]
        if result.boxes is None or len(result.boxes) < 4:
            return None

        boxes = result.boxes
        confs = boxes.conf.cpu().numpy()
        if np.any(confs < self.conf):
            return None

        centers = []
        for xyxy in boxes.xyxy.cpu().numpy():
            x1, y1, x2, y2 = xyxy
            centers.append([(x1 + x2) / 2.0, (y1 + y2) / 2.0])
        points = np.array(centers, dtype=np.float32)
        if len(points) < 4:
            return None

        if len(points) > 4:
            indices = np.argsort(confs)[-4:]
            points = points[indices]

        points = _sort_corners(points)
        height, width = frame.shape[:2]
        if not self._in_bounds(points, width, height):
            return None
        if not self._is_convex(points):
            return None
        area = cv2.contourArea(points.reshape(-1, 1, 2))
        if area < self.min_area_px:
            return None
        return points.astype(np.float32)

