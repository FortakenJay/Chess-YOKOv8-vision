"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BridgeConfig,
  STORAGE_KEYS,
  uploadFrame,
} from "@/lib/bridge";

function readStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function readStoredBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}

export default function CameraStreamer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const uploadingRef = useRef(false);
  const isStreamingRef = useRef(false);

  const [host, setHost] = useState(() =>
    readStored(STORAGE_KEYS.host, "192.168.0.10"),
  );
  const [port, setPort] = useState(() => readStored(STORAGE_KEYS.port, "8080"));
  const [flipH, setFlipH] = useState(() =>
    readStoredBool(STORAGE_KEYS.flipH, false),
  );
  const [flipV, setFlipV] = useState(() =>
    readStoredBool(STORAGE_KEYS.flipV, false),
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [senderFps, setSenderFps] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const sentTimestampsRef = useRef<number[]>([]);
  const configRef = useRef<BridgeConfig>({ host, port, flipH, flipV });

  useEffect(() => {
    configRef.current = { host, port, flipH, flipV };
    window.localStorage.setItem(STORAGE_KEYS.host, host);
    window.localStorage.setItem(STORAGE_KEYS.port, port);
    window.localStorage.setItem(STORAGE_KEYS.flipH, flipH ? "1" : "0");
    window.localStorage.setItem(STORAGE_KEYS.flipV, flipV ? "1" : "0");
  }, [host, port, flipH, flipV]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const canStream =
    host.trim().length > 0 && port.trim().length > 0;

  const stopMedia = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API not available in this browser");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    mediaStreamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      throw new Error("Video element missing");
    }

    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();
    setCameraReady(true);
  }, []);

  const captureAndUpload = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.72);
    });
    if (!blob) return;

    await uploadFrame(configRef.current, blob);
    const now = performance.now();
    sentTimestampsRef.current.push(now);
    sentTimestampsRef.current = sentTimestampsRef.current.filter(
      (t) => now - t <= 2000,
    );
    setSenderFps(sentTimestampsRef.current.length / 2);
    setStatusText("Streaming");
    setLastError(null);
  }, []);

  const pumpFrames = useCallback(() => {
    const tick = async () => {
      if (!isStreamingRef.current) return;

      if (!uploadingRef.current) {
        uploadingRef.current = true;
        try {
          await captureAndUpload();
        } catch (err) {
          setLastError(err instanceof Error ? err.message : "Upload failed");
          setStatusText("Stream error");
        } finally {
          uploadingRef.current = false;
        }
      }

      rafRef.current = requestAnimationFrame(() => {
        void tick();
      });
    };

    void tick();
  }, [captureAndUpload]);

  const startStreaming = useCallback(async () => {
    if (!canStream) {
      setStatusText("Enter bridge host and port");
      return;
    }
    try {
      setLastError(null);
      setStatusText("Starting camera...");
      await startMedia();
      setIsStreaming(true);
      setStatusText("Streaming");
      sentTimestampsRef.current = [];
      pumpFrames();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Camera start failed");
      setStatusText("Camera error");
      stopMedia();
      setIsStreaming(false);
    }
  }, [canStream, pumpFrames, startMedia, stopMedia]);

  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
    setStatusText("Stopped");
    setSenderFps(0);
    stopMedia();
  }, [stopMedia]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && isStreamingRef.current) {
        setIsStreaming(false);
        stopMedia();
        setStatusText("Paused (tab hidden)");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopMedia]);

  useEffect(() => () => stopMedia(), [stopMedia]);

  return (
    <Shell>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      <TopBar
        senderFps={senderFps}
        statusText={statusText}
        onOpenSettings={() => setShowSettings(true)}
      />

      <BottomBar
        flipH={flipH}
        flipV={flipV}
        isStreaming={isStreaming}
        canStream={canStream}
        lastError={lastError}
        onFlipH={() => setFlipH((v) => !v)}
        onFlipV={() => setFlipV((v) => !v)}
        onToggle={() => (isStreaming ? stopStreaming() : void startStreaming())}
      />

      {showSettings && (
        <SettingsModal
          host={host}
          port={port}
          onHost={setHost}
          onPort={setPort}
          onClose={() => setShowSettings(false)}
        />
      )}

      {!cameraReady && !isStreaming && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-white/80">
          Tap Start Streaming — allow camera access
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
      {children}
    </div>
  );
}

function TopBar({
  senderFps,
  statusText,
  onOpenSettings,
}: {
  senderFps: number;
  statusText: string;
  onOpenSettings: () => void;
}) {
  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-3 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="rounded-xl bg-black/55 px-3 py-2">
        <p className="text-xl font-bold text-green-400">
          {senderFps.toFixed(1)} fps
        </p>
        <p className="text-xs text-white/85">{statusText}</p>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white"
        aria-label="Settings"
      >
        ⚙
      </button>
    </div>
  );
}

function BottomBar({
  flipH,
  flipV,
  isStreaming,
  canStream,
  lastError,
  onFlipH,
  onFlipV,
  onToggle,
}: {
  flipH: boolean;
  flipV: boolean;
  isStreaming: boolean;
  canStream: boolean;
  lastError: string | null;
  onFlipH: () => void;
  onFlipV: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-md">
        <div className="grid grid-cols-2 gap-2">
          <FlipButton label="Flip H" on={flipH} onClick={onFlipH} />
          <FlipButton label="Flip V" on={flipV} onClick={onFlipV} />
        </div>
        <button
          type="button"
          disabled={!canStream}
          onClick={onToggle}
          className={`mt-3 w-full rounded-xl py-4 text-lg font-bold text-white ${
            isStreaming
              ? "bg-red-600/90"
              : "bg-emerald-600/90 disabled:bg-zinc-600"
          }`}
        >
          {isStreaming ? "Stop" : "Start Streaming"}
        </button>
        {lastError ? (
          <p className="mt-2 text-xs text-red-400">{lastError}</p>
        ) : null}
      </div>
    </div>
  );
}

function FlipButton({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full py-2.5 text-sm font-semibold ${
        on ? "bg-emerald-700/80 text-white" : "bg-white/15 text-white"
      }`}
    >
      {label}: {on ? "On" : "Off"}
    </button>
  );
}

function SettingsModal({
  host,
  port,
  onHost,
  onPort,
  onClose,
}: {
  host: string;
  port: string;
  onHost: (v: string) => void;
  onPort: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <SettingsOverlay onClose={onClose}>
      <h2 className="mb-4 text-lg font-semibold">Bridge settings</h2>
      <label className="mb-3 block text-sm text-zinc-400">
        PC LAN IP
        <input
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-3 text-base text-white"
          value={host}
          onChange={(e) => onHost(e.target.value)}
          inputMode="decimal"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      <label className="mb-4 block text-sm text-zinc-400">
        Port
        <input
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-3 text-base text-white"
          value={port}
          onChange={(e) => onPort(e.target.value)}
          inputMode="numeric"
        />
      </label>
      <p className="mb-4 text-xs text-zinc-500">
        Safari live camera via getUserMedia. Frames POST to bridge /frame; CV reads
        /stream.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl bg-blue-600 py-3 font-semibold"
      >
        Done
      </button>
    </SettingsOverlay>
  );
}

function SettingsOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-end bg-black/50"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-zinc-900 p-5 text-white pb-[max(20px,env(safe-area-inset-bottom))]"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
