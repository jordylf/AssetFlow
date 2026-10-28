import { useEffect, useState } from "react";
import { ArrowUpRight, LoaderCircle, ScanSearch } from "lucide-react";
import type { Asset } from "../types";
import { desktop, openAssetWith, readTechnicalMetadata, type TechnicalMetadata } from "../lib/filesystem";

export function OpenWithButton({ asset }: { asset: Asset }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="asset-open-with">
      <button className="button secondary full-width" disabled={busy || !desktop} onClick={() => {
        setBusy(true); setError("");
        void openAssetWith(asset.path).catch((e) => setError(String(e))).finally(() => setBusy(false));
      }} title="Choose an application in the Windows Open With dialog">
        {busy ? <LoaderCircle size={14} className="spin" /> : <ArrowUpRight size={14} />}
        {busy ? "Choosing application…" : "Open with…"}
      </button>
      {error && <p className="asset-tool-note error" role="alert">{error}</p>}
    </div>
  );
}

export function TechnicalDetails({ asset }: { asset: Asset }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<TechnicalMetadata | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!attempt) return;
    let cancelled = false;
    setLoading(true); setError(""); setResult(null);
    void readTechnicalMetadata(asset.path)
      .then((value) => { if (!cancelled) setResult(value); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [asset.path, attempt]);
  return (
    <section className="technical-details" aria-label="Technical metadata" aria-busy={loading}>
      <h3>Technical metadata</h3>
      {!attempt && <p className="asset-tool-note">Read codec, bitrate, color and audio properties locally, only when needed.</p>}
      {loading && <p className="asset-tool-note" role="status"><LoaderCircle size={13} className="spin" /> Reading file headers…</p>}
      {!!result?.fields.length && <dl className="technical-fields">{result.fields.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
      {result?.note && <p className="asset-tool-note">{result.note}</p>}
      {error && <p className="asset-tool-note error" role="alert">{error}</p>}
      {!result?.fields.length && !loading && <button className="button secondary compact full-width" disabled={!desktop} onClick={() => setAttempt((n) => n + 1)}><ScanSearch size={13} />{attempt ? "Try again" : "Read technical metadata"}</button>}
      {!!result?.fields.length && <p className="asset-tool-note">Reported by ffprobe · unavailable fields are omitted. Frame rate describes the stream, not a frame-by-frame analysis.</p>}
    </section>
  );
}
