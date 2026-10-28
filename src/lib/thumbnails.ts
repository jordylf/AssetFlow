import { useEffect, useState, type RefObject } from "react";
import type { Asset } from "../types";
import { thumbnail } from "./filesystem";

// Cards are ~300×176 CSS px; covering 480×282 keeps them sharp up to ~1.6x DPR.
const COVER = { width: 480, height: 282 };
const CACHE_BYTES = 32 * 1024 * 1024;
const CONCURRENCY = 3;

type Entry = { url: string; bytes: number; users: number };
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<string>>();
let cachedBytes = 0;
let active = 0;
const queue: (() => void)[] = [];

function evict() {
  // Map iteration order is insertion order; `acquire` re-inserts, so the first unused entry is the LRU.
  for (const [key, entry] of cache) {
    if (cachedBytes <= CACHE_BYTES) return;
    if (entry.users) continue;
    URL.revokeObjectURL(entry.url);
    cache.delete(key);
    cachedBytes -= entry.bytes;
  }
}
async function slot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await task();
  } finally {
    active--;
    queue.shift()?.();
  }
}
async function render(src: string) {
  // The full-size decode is short-lived: only the small re-encoded copy is kept.
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = src;
  await image.decode();
  const scale = Math.min(
    1,
    Math.max(
      COVER.width / image.naturalWidth,
      COVER.height / image.naturalHeight,
    ),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const bitmap = await createImageBitmap(image, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "medium",
  });
  image.src = "";
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
}
function acquire(key: string, src: string): Promise<string> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    hit.users++;
    return Promise.resolve(hit.url);
  }
  let job = pending.get(key);
  if (!job) {
    job = slot(() => render(src))
      .then((blob) => {
        const entry = {
          url: URL.createObjectURL(blob),
          bytes: blob.size,
          users: 0,
        };
        cache.set(key, entry);
        cachedBytes += entry.bytes;
        return entry.url;
      })
      .finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job.then((url) => {
    const entry = cache.get(key);
    if (entry) entry.users++;
    return url;
  });
}
function release(key: string) {
  const entry = cache.get(key);
  if (entry) entry.users = Math.max(0, entry.users - 1);
  evict();
}

/** A small cached thumbnail URL while `ref` is near the viewport; undefined otherwise. */
export function useThumbnail(
  asset: Asset,
  enabled: boolean,
  ref: RefObject<Element | null>,
) {
  const original = enabled ? thumbnail(asset.path, asset.extension) : undefined;
  const src = original ? `${original}?v=${asset.size}-${asset.modified}` : undefined;
  const key = `${asset.path}|${asset.size}|${asset.modified}`;
  const [near, setNear] = useState(false);
  const [state, setState] = useState<{ url?: string; failed: boolean }>({
    failed: false,
  });
  useEffect(() => {
    const element = ref.current;
    if (!src || !element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [src, ref]);
  useEffect(() => {
    if (!src || !near) return;
    let cancelled = false;
    let held = false;
    acquire(key, src).then(
      (url) => {
        held = true;
        if (cancelled) release(key);
        else setState({ url, failed: false });
      },
      () => {
        if (!cancelled) setState({ failed: true });
      },
    );
    return () => {
      cancelled = true;
      if (held) release(key);
      // Off-screen cards drop their image so the decoded pixels can be freed.
      setState((s) => (s.failed ? s : { failed: false }));
    };
  }, [src, near, key]);
  return { supported: !!src, url: state.url, failed: state.failed };
}
