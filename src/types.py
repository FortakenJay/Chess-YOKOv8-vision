"""Shared dataclasses and type aliases."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import chess

BoardMap = dict[tuple[int, int], str]
GameResult = Literal["white", "black", "draw", "unknown"]


@dataclass(slots=True)
class DetectedPiece:
    label: str
    confidence: float
    x1: int
    y1: int
    x2: int
    y2: int
    square: str | None = None


@dataclass(slots=True)
class MoveEvent:
    move_number: int
    side_to_move: str
    move_uci: str
    move_san: str
    from_square: str
    to_square: str
    fen_after: str
    move: chess.Move


@dataclass(slots=True)
class GameState:
    played_at: datetime | None
    starting_fen: str
    moves: list[chess.Move]
    sans: list[str]


@dataclass(slots=True)
class ExportResult:
    pgn: str
    file_path: str
    opening_name: str | None
    opening_eco: str | None

