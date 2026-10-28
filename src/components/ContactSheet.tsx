import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Download, Grid2X2, LoaderCircle } from "lucide-react";
import type { Asset, Project } from "../types";
import { exportContactSheet, openSavedContactSheet } from "../lib/filesystem";
import { sheetThumbnail } from "../lib/contactSheet";
import { formatSize } from "../lib/format";
import { Modal } from "./Modal";
import { AssetArtwork } from "./AssetCard";

export default function ContactSheet({ project, assets, onClose }: { project: Project; assets: Asset[]; onClose: () => void }) {
  const candidates = assets.slice(0, 200);
  const [chosen, setChosen] = useState(() => new Set(candidates.slice(0, 60).map((a) => a.path)));
  const [title, setTitle] = useState(project.name.slice(0, 120));
  const [columns, setColumns] = useState(3);
  const [images, setImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [missing, setMissing] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const exporting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const selected = candidates.filter((a) => chosen.has(a.path));
  const build = async () => {
    if (exporting.current || !selected.length || !title.trim()) return;
    exporting.current = true; setBusy(true); setError(""); setSaved(""); setProgress(0);
    const abort = new AbortController(); controller.current = abort;
    try {
      const entries: { path: string; thumbnail: string | null }[] = [];
      let skipped = 0;
      for (const asset of selected) {
        abort.signal.throwIfAborted();
        const thumbnail = images ? await sheetThumbnail(asset, abort.signal) : null;
        if (images && !thumbnail && ["Images", "Textures"].includes(asset.kind)) skipped++;
        entries.push({ path: asset.path, thumbnail });
        setProgress(entries.length);
        // Yield between files; no background workers or unbounded export cache.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      abort.signal.throwIfAborted();
      const path = await exportContactSheet(title.trim(), columns, entries);
      if (mounted.current) { setSaved(path ?? ""); setMissing(skipped); }
    } catch (e) {
      if (mounted.current && !abort.signal.aborted) setError(String(e));
    } finally {
      exporting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Modal title="Contact Sheet" onClose={onClose} wide busy={busy} className="contact-sheet-modal">
      <div className="sheet-body">
      <div className="sheet-intro"><Grid2X2 size={25} /><div><h3>A clear view of your collection.</h3><p>Choose assets from the current search and filters. Export a standalone HTML catalog, then print or Save as PDF in your browser.</p></div></div>
      <div className="sheet-controls">
        <label>Title<input value={title} maxLength={120} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Columns<select aria-label="Contact sheet columns" value={columns} disabled={busy} onChange={(e) => setColumns(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n} columns</option>)}</select></label>
      </div>
      <div className="sheet-options"><label><input type="checkbox" checked={images} disabled={busy} onChange={(e) => setImages(e.target.checked)} /> Include small image thumbnails</label><span>{selected.length} selected · {formatSize(selected.reduce((n, a) => n + a.size, 0))}</span></div>
      <p className="asset-tool-note">Includes filenames, project-relative paths, extensions and sizes. Review before sharing. Sources are never copied or moved. Large or unsupported images use format labels.</p>
      {assets.length > 200 && <p className="sheet-limit" role="note">Showing the first 200 of {assets.length.toLocaleString()} matching assets. Narrow your search or filters to choose a different set.</p>}
      <div className="sheet-selection-actions"><button className="button secondary compact" disabled={busy} onClick={() => setChosen(new Set(candidates.map((a) => a.path)))}>Select all {candidates.length}</button><button className="button secondary compact" disabled={busy} onClick={() => setChosen(new Set())}>Clear selection</button><span>Layout preview · {columns} columns</span></div>
      <div className="sheet-preview" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }} aria-label="Contact sheet assets">
        {candidates.map((asset) => <label key={asset.path} className={chosen.has(asset.path) ? "selected" : ""}><div className="sheet-art"><input aria-label={`Include ${asset.relativePath}`} type="checkbox" checked={chosen.has(asset.path)} disabled={busy} onChange={(e) => setChosen((prev) => { const next = new Set(prev); if (e.target.checked) next.add(asset.path); else next.delete(asset.path); return next; })} /><AssetArtwork asset={asset} thumbnails={images && chosen.has(asset.path)} /></div><strong title={asset.name}>{asset.name}</strong><small title={asset.relativePath}>{asset.relativePath}</small></label>)}
      </div>
      {busy && <p className="sheet-status" role="status"><LoaderCircle size={14} className="spin" />{progress < selected.length ? `Preparing thumbnails · ${progress} / ${selected.length}` : "Choose a new filename in the Save dialog…"}</p>}
      {error && <p className="asset-tool-note error" role="alert">{error}</p>}
      {saved && <div className="sheet-success" role="status"><strong>Contact sheet saved</strong><p>{saved}</p>{missing > 0 && <p>{missing} images used format labels because a thumbnail was unavailable.</p>}<button className="button secondary compact" onClick={() => void openSavedContactSheet().catch((e) => setError(String(e)))}><ArrowUpRight size={14} />Open in browser / print</button></div>}
      </div>
      <div className="modal-actions"><span className="asset-tool-note">Local export · no uploads · by odyworks</span><button className="button secondary" disabled={busy && progress >= selected.length} onClick={() => { if (busy) controller.current?.abort(); else onClose(); }}>{busy ? "Cancel preparation" : "Close"}</button><button className="button primary" disabled={busy || !selected.length || !title.trim()} onClick={() => void build()}><Download size={14} />Export contact sheet</button></div>
    </Modal>
  );
}
