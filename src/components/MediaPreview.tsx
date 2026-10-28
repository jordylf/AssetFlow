import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CircleAlert,
  FileAudio,
  FileImage,
  FileVideo,
  FolderOpen,
  Maximize,
  Minus,
  Plus,
  ScanSearch,
  Star,
  X,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Asset } from "../types";
import { formatDate, formatSize } from "../lib/format";
import { revealAsset, videoExtensions } from "../lib/filesystem";
import { OpenWithButton, TechnicalDetails } from "./AssetTools";
import "./ModelInspector.css";

const duration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "Unknown";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s % 60).padStart(2, "0")}`;
};

function Shell({
  asset,
  eyebrow,
  favorite,
  onFavorite,
  onClose,
  onError,
  details,
  children,
}: {
  asset: Asset;
  eyebrow: string;
  favorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
  onError: (message: string) => void;
  details: [string, ReactNode][];
  children: ReactNode;
}) {
  const Icon = eyebrow.startsWith("IMAGE")
    ? FileImage
    : eyebrow.startsWith("VIDEO")
      ? FileVideo
      : FileAudio;
  return (
    <div className="model-inspector-shell">
      <header className="model-header">
        <span className="model-header-icon">
          <Icon size={20} strokeWidth={1.5} />
        </span>
        <div>
          <span className="model-eyebrow">
            {eyebrow} <i /> {asset.extension.toUpperCase()}
          </span>
          <h2 title={asset.name}>{asset.name}</h2>
        </div>
        <div className="model-header-actions">
          <button
            className={`icon-button ${favorite ? "is-favorite" : ""}`}
            onClick={onFavorite}
            aria-label="Toggle favorite"
            aria-pressed={favorite}
            title="Toggle favorite"
          >
            <Star size={17} fill={favorite ? "currentColor" : "none"} />
          </button>
          <button
            className="icon-button"
            aria-label="Close preview"
            title="Close · Esc"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div className="model-workspace">
        {children}
        <aside className="model-properties" aria-label="File details">
          <div className="model-properties-heading">
            <h3>Properties</h3>
          </div>
          <dl className="model-file-properties">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <div>
              <dt>Size</dt>
              <dd>{formatSize(asset.size)}</dd>
            </div>
            <div>
              <dt>Modified</dt>
              <dd>{formatDate(asset.modified)}</dd>
            </div>
          </dl>
          <TechnicalDetails asset={asset} />
          <OpenWithButton asset={asset} />
          <div className="model-source-path" title={asset.relativePath}>
            {asset.relativePath}
          </div>
          <button
            className="button secondary full-width"
            onClick={() => void revealAsset(asset.path).catch((e) => onError(String(e)))}
          >
            <FolderOpen size={15} />
            Show in File Explorer
          </button>
        </aside>
      </div>
    </div>
  );
}

type View = { scale: number; x: number; y: number };
export function ImagePreview(props: {
  asset: Asset;
  favorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const fitScale = () => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || !size) return 1;
    return Math.min(1, (box.width - 32) / size.w, (box.height - 32) / size.h);
  };
  const fit = () => setView({ scale: fitScale(), x: 0, y: 0 });
  const zoom = (factor: number, cx = 0, cy = 0) =>
    setView((v) => {
      const scale = Math.min(32, Math.max(0.02, v.scale * factor));
      const k = scale / v.scale;
      // Keep the point under the cursor fixed (cx/cy are relative to the stage centre).
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  useEffect(fit, [size]);
  useEffect(() => {
    const element = stage.current;
    const img = image.current;
    if (!element) return;
    // A cached image may finish before React's onLoad listener exists.
    if (img?.complete)
      if (img.naturalWidth) setSize({ w: img.naturalWidth, h: img.naturalHeight });
      else setFailed(true);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = element.getBoundingClientRect();
      zoom(
        Math.exp(-e.deltaY * 0.0015),
        e.clientX - box.left - box.width / 2,
        e.clientY - box.top - box.height / 2,
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      // Release the full-size decode as soon as the viewer closes.
      img?.removeAttribute("src");
    };
  }, []);
  const key = (e: React.KeyboardEvent) => {
    const step = 60;
    const actions: Record<string, () => void> = {
      "+": () => zoom(1.25),
      "=": () => zoom(1.25),
      "-": () => zoom(0.8),
      "0": fit,
      "1": () => setView({ scale: 1, x: 0, y: 0 }),
      ArrowLeft: () => setView((v) => ({ ...v, x: v.x + step })),
      ArrowRight: () => setView((v) => ({ ...v, x: v.x - step })),
      ArrowUp: () => setView((v) => ({ ...v, y: v.y + step })),
      ArrowDown: () => setView((v) => ({ ...v, y: v.y - step })),
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };
  return (
    <Shell
      {...props}
      eyebrow="IMAGE PREVIEW"
      details={[
        ["Dimensions", size ? `${size.w.toLocaleString()} × ${size.h.toLocaleString()} px` : failed ? "Unknown" : "Reading…"],
        ["Zoom", `${Math.round(view.scale * 100)}%`],
        ["Aspect ratio", size ? `${(size.w / size.h).toFixed(3)}:1` : "—"],
      ]}
    >
      <section className="model-stage" aria-label="Image preview">
        <div className="model-toolbar">
          <span className="studio-label">
            <span className="status-dot" />
            ORIGINAL<span>READ ONLY</span>
          </span>
          <div role="group" aria-label="Zoom">
            <button aria-label="Zoom out" title="Zoom out · −" onClick={() => zoom(0.8)}>
              <Minus size={14} />
            </button>
            <button aria-label="Zoom in" title="Zoom in · +" onClick={() => zoom(1.25)}>
              <Plus size={14} />
            </button>
            <i />
            <button aria-label="Fit to view" title="Fit · 0" onClick={fit}>
              <Maximize size={14} />
              <span>Fit</span>
            </button>
            <button
              aria-label="Actual size"
              title="Actual size · 1"
              onClick={() => setView({ scale: 1, x: 0, y: 0 })}
            >
              <ScanSearch size={14} />
              <span>100%</span>
            </button>
          </div>
        </div>
        <div
          ref={stage}
          className="image-stage checkerboard"
          tabIndex={0}
          aria-label="Image. Wheel or + and − to zoom, drag or arrow keys to pan, 0 to fit, 1 for actual size."
          onKeyDown={key}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX - view.x, y: e.clientY - view.y };
          }}
          onPointerMove={(e) => {
            if (drag.current)
              setView((v) => ({ ...v, x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y }));
          }}
          onPointerUp={() => (drag.current = null)}
          onDoubleClick={fit}
        >
          {failed ? (
            <div className="model-state" role="alert">
              <CircleAlert size={28} />
              <h3>This image can’t be previewed</h3>
              <p>WebView2 cannot decode this file. Open it in its original app.</p>
            </div>
          ) : (
            <img
              ref={image}
              src={convertFileSrc(props.asset.path)}
              alt={props.asset.name}
              decoding="async"
              draggable={false}
              onLoad={(e) =>
                setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              onError={() => setFailed(true)}
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                imageRendering: view.scale >= 2 ? "pixelated" : "auto",
                visibility: size ? "visible" : "hidden",
              }}
            />
          )}
        </div>
      </section>
    </Shell>
  );
}

export function PlaybackPreview(props: {
  asset: Asset;
  favorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const video = videoExtensions.includes(props.asset.extension);
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [meta, setMeta] = useState<{ duration: number; w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    // Metadata or an error can arrive before React attaches its listeners, so check the
    // current state and listen natively.
    const fail = () => setFailed(true);
    const read = () =>
      setMeta({
        duration: element.duration,
        w: element.videoWidth ?? 0,
        h: element.videoHeight ?? 0,
      });
    if (element.error) fail();
    else if (element.readyState >= HTMLMediaElement.HAVE_METADATA) read();
    element.addEventListener("error", fail);
    element.addEventListener("loadedmetadata", read);
    return () => {
      element.removeEventListener("error", fail);
      element.removeEventListener("loadedmetadata", read);
      // Stop playback and drop the decoder and buffered data immediately.
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, []);
  const Tag = video ? "video" : "audio";
  return (
    <Shell
      {...props}
      eyebrow={video ? "VIDEO PREVIEW" : "AUDIO PREVIEW"}
      details={[
        ["Duration", meta ? duration(meta.duration) : failed ? "Unknown" : "Reading…"],
        ...(video
          ? ([["Resolution", meta?.w ? `${meta.w} × ${meta.h}` : failed ? "Unknown" : "Reading…"]] as [string, ReactNode][])
          : []),
      ]}
    >
      <section className={`model-stage media-stage ${video ? "" : "audio-stage"}`} aria-label="Media preview">
        {failed ? (
          <div className="model-state" role="alert">
            <CircleAlert size={28} />
            <h3>This format can’t be played here</h3>
            <p>
              WebView2 does not support this file’s codec or container. Open it in its original
              app instead.
            </p>
          </div>
        ) : (
          <Tag
            ref={media}
            src={convertFileSrc(props.asset.path)}
            controls
            preload="metadata"
            autoFocus
          />
        )}
      </section>
    </Shell>
  );
}
