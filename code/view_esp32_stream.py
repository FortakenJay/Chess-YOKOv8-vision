"""Quick viewer for ESP32-CAM MJPEG stream."""

from __future__ import annotations

import argparse

import cv2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="View ESP32 MJPEG stream")
    parser.add_argument("--url", required=True, help="Example: http://192.168.1.50:81/stream")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cap = cv2.VideoCapture(args.url)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open stream: {args.url}")

    print("Press q to quit.")
    while True:
        ok, frame = cap.read()
        if not ok or frame is None:
            print("Frame read failed; exiting.")
            break
        cv2.imshow("ESP32 Stream", frame)
        if (cv2.waitKey(1) & 0xFF) == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

