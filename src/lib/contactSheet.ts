import { convertFileSrc } from "@tauri-apps/api/core";
import type { Asset } from "../types";

/** One short-lived decode at a time. Export never holds a full collection of source images. */
export async function sheetThumbnail(asset: Asset, signal: AbortSignal): Promise<string | null> {
  if (!["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes(asset.extension) || asset.size > 24 * 1024 * 1024) return null;
  signal.throwIfAborted();
  const image = new Image();
  image.crossOrigin = "anonymous";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image unavailable"));
      abort = () => { image.src = ""; reject(new DOMException("Cancelled", "AbortError")); };
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => { image.src = ""; reject(new Error("Thumbnail timed out")); }, 6000);
      image.src = convertFileSrc(asset.path);
    });
    signal.throwIfAborted();
    const scale = Math.min(1, 360 / image.naturalWidth, 240 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.7);
    canvas.width = canvas.height = 0;
    return data.startsWith("data:image/webp;base64,") && data.length <= 131072 ? data : null;
  } catch (e) {
    if (signal.aborted) throw e;
    return null; // Unreadable/unsupported images still get a labeled catalog entry.
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
    image.onload = image.onerror = null;
    image.removeAttribute("src");
  }
}
