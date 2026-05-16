"""CLI entrypoint for chess vision recorder."""

from __future__ import annotations

import argparse
import logging

from src.pipeline import ChessVisionPipeline
from src.settings import load_settings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chess Vision Recorder")
    parser.add_argument("--start", action="store_true", help="Start game immediately")
    parser.add_argument("--config", default="config.yaml", help="Path to config file")
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args = parse_args()

    settings = load_settings(args.config)
    orientation = input("Is white playing from bottom? (y/n): ").strip().lower()
    white_bottom = orientation != "n"

    pipeline = ChessVisionPipeline(settings=settings, white_bottom=white_bottom)
    if args.start:
        pipeline.start_game()
    pipeline.run()


if __name__ == "__main__":
    main()

