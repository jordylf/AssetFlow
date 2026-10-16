export function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const n = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** n).toLocaleString(undefined, { maximumFractionDigits: n > 0 ? 1 : 0 })} ${["B", "KB", "MB", "GB", "TB"][n]}`;
}
export function formatDate(ms: number) {
  return ms
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(ms)
    : "Unknown date";
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export const categories = [
  "References",
  "Design",
  "Models",
  "Textures",
  "Video",
  "Audio",
  "Exports",
  "Documents",
  "Other",
] as const;
export const categoryColors: Record<string, string> = {
  References: "#8ba7df",
  Design: "#ba9de6",
  Models: "#dbad7b",
  Textures: "#91b888",
  Video: "#cd92ab",
  Audio: "#8dbfc2",
  Exports: "#8ed4b5",
  Documents: "#b8b8c4",
  Other: "#81858d",
};
