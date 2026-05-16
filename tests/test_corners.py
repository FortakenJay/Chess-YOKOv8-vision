import sys
import types
from pathlib import Path

import numpy as np

from src.corners import CornerDetector


class _FakeTensor:
    def __init__(self, arr):
        self._arr = np.array(arr, dtype=np.float32)

    def cpu(self):
        return self

    def numpy(self):
        return self._arr


class _FakeBoxes:
    def __init__(self):
        self.xyxy = _FakeTensor(
            [
                [10, 10, 20, 20],
                [110, 10, 120, 20],
                [110, 110, 120, 120],
                [10, 110, 20, 120],
            ]
        )
        self.conf = _FakeTensor([0.9, 0.95, 0.97, 0.92])

    def __len__(self):
        return 4


class _FakeResult:
    def __init__(self):
        self.boxes = _FakeBoxes()


class _FakeYOLO:
    def __init__(self, *_args, **_kwargs):
        pass

    def predict(self, **_kwargs):
        return [_FakeResult()]


def test_corner_detect_success(tmp_path: Path, monkeypatch):
    model = tmp_path / "corners.pt"
    model.write_text("x", encoding="utf-8")
    fake_ultra = types.SimpleNamespace(YOLO=_FakeYOLO)
    monkeypatch.setitem(sys.modules, "ultralytics", fake_ultra)

    detector = CornerDetector(str(model), conf=0.5, min_area_px=100)
    frame = np.zeros((200, 200, 3), dtype=np.uint8)
    corners = detector.detect(frame)
    assert corners is not None
    assert corners.shape == (4, 2)

