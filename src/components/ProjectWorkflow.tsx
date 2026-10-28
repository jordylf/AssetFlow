import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Activity, ArrowLeft, CheckCircle2, CircleAlert, FolderOpen, LoaderCircle, Package, ShieldCheck } from "lucide-react";
import type { Asset, HealthReport, PackagePlan, PackageProgress, PackageResult, Project } from "../types";
import { cancelPackage, cancelPackagePreview, checkProjectHealth, confirmPackage, openPackageFolder, preparePackage } from "../lib/filesystem";
import { formatDate, formatSize } from "../lib/format";
import { Modal } from "./Modal";

export default function ProjectWorkflow({ mode, project, assets, onClose }: { mode: "health" | "package"; project: Project; assets: Asset[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [attempt, setAttempt] = useState(0);
  const candidates = assets.slice(0, 5000);
  const [chosen, setChosen] = useState(() => new Set(candidates.slice(0, 60).map((a) => a.relativePath)));
  const [shown, setShown] = useState(200);
  const [plan, setPlan] = useState<PackagePlan | null>(null);
  const [result, setResult] = useState<PackageResult | null>(null);
  const [progress, setProgress] = useState<PackageProgress | null>(null);
  const planRef = useRef<PackagePlan | null>(null); planRef.current = plan;
  const alive = useRef(true);
  const operating = useRef(false);
  useEffect(() => {
    alive.current = true;
    let off: (() => void) | undefined;
    void listen<PackageProgress>("assetflow:package-progress", ({ payload }) => {
      if (alive.current && payload.id === planRef.current?.id) setProgress(payload);
    }).then((unlisten) => { if (alive.current) off = unlisten; else unlisten(); });
    return () => { alive.current = false; off?.(); if (planRef.current) void cancelPackagePreview(planRef.current.id).catch(() => {}); };
  }, []);
  useEffect(() => {
    if (mode !== "health") return;
    let cancelled = false; setBusy(true); setError("");
    void checkProjectHealth().then((report) => { if (!cancelled) setHealth(report); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [mode, attempt]);
  const review = async () => {
    if (operating.current) return;
    operating.current = true; setBusy(true); setError(""); setResult(null); setProgress(null);
    try { const next = await preparePackage([...chosen]); if (alive.current) setPlan(next); else void cancelPackagePreview(next.id).catch(() => {}); }
    catch (e) { if (alive.current) setError(String(e)); }
    finally { operating.current = false; if (alive.current) setBusy(false); }
  };
  const collect = async () => {
    if (!plan || operating.current) return;
    operating.current = true; setBusy(true); setError(""); setProgress(null);
    try {
      const next = await confirmPackage(plan.id);
      if (alive.current) { setResult(next); if (!next) setPlan(null); }
    } catch (e) { if (alive.current) { setError(String(e)); setPlan(null); } }
    finally { operating.current = false; if (alive.current) setBusy(false); }
  };
  const reset = () => { if (plan) void cancelPackagePreview(plan.id).catch(() => {}); setPlan(null); setResult(null); setProgress(null); setError(""); };
  return (
    <Modal title={mode === "health" ? "Project Health Check" : "Collect & Package"} onClose={onClose} busy={busy} wide className="workflow-modal">
      <div className="workflow-body">
        <div className="workflow-intro">{mode === "health" ? <Activity size={27} /> : <Package size={27} />}<div><h3>{mode === "health" ? "Know what needs attention." : "Ready to hand over."}</h3><p>{mode === "health" ? "Read-only checks for missing GLTF resources, scan warnings, empty files and large assets." : "Copy selected assets and known GLTF/GLB dependencies into a new folder. Your source project stays in place."}</p></div></div>
        <p className="asset-tool-note">{project.name} · Dependency analysis covers GLTF/GLB buffers and textures. Blender, Adobe, video-editor and code imports are not analyzed.</p>
        {mode === "health" ? <>
          {busy && <p role="status" className="workflow-status"><LoaderCircle className="spin" size={16} />Checking project metadata and model references…</p>}
          {health && <>
            <div className="workflow-totals"><span><strong>{health.files.toLocaleString()}</strong> files checked</span><span><strong>{health.models}</strong> GLTF/GLB models</span><span className={health.errors ? "danger" : ""}><strong>{health.errors}</strong> errors</span><span><strong>{health.warnings}</strong> warnings</span></div>
            <p className="asset-tool-note">Checked {formatDate(health.checkedAt)}. Results are a snapshot; fix files in their original application, then run again.</p>
            {!health.issues.length ? <div className="workflow-good"><CheckCircle2 size={22} /><strong>No issues found in the supported checks.</strong><p>This is not a full validation of every creative file format.</p></div> : <div className="workflow-issues" aria-label="Health check findings">{health.issues.map((issue, i) => <article key={`${issue.path}-${i}`} className={`workflow-issue ${issue.severity}`}><CircleAlert size={15} /><div><strong>{issue.path}</strong><p>{issue.message}</p><small>{issue.severity === "error" ? "Dependency error" : "Review recommended"}</small></div></article>)}</div>}
            {health.truncated && <p className="asset-tool-note">Showing the first 1,000 findings. Totals include all detected issues.</p>}
          </>}
        </> : result ? <div className={result.complete ? "workflow-good" : "workflow-partial"} role="status">
          {result.complete ? <CheckCircle2 size={23} /> : <CircleAlert size={23} />}<h3>{result.complete ? "Package collected." : "Package is incomplete."}</h3>
          <p>{result.copied} of {result.total} files copied.</p><p className="package-output">{result.path}</p>
          {result.error && <p>{result.error}</p>}
          <p>{result.complete ? "manifest.json contains SHA-256 checksums and complete: true. Project-relative folders are preserved inside assets/." : "Partial files are retained. Do not share this folder as a complete package; review PACKAGE_STATUS.txt and collect again into a new folder."}</p>
          <button className="button secondary compact" onClick={() => void openPackageFolder().catch((e) => setError(String(e)))}><FolderOpen size={14} />Open package folder</button>
        </div> : plan ? <>
          <div className="workflow-totals"><span><strong>{plan.requested}</strong> selected</span><span><strong>{plan.files.filter((f) => f.dependency).length}</strong> dependencies added</span><span><strong>{formatSize(plan.totalBytes)}</strong> to copy</span></div>
          {plan.notes.map((note) => <p className="asset-tool-note" key={note}>{note}</p>)}
          {!!plan.issues.length && <div className="workflow-issues" role="alert"><h4>Resolve these dependencies before collecting</h4>{plan.issues.map((issue,i) => <p key={i}>{issue}</p>)}</div>}
          <div className="package-files" aria-label="Package file preview">{plan.files.slice(0, shown).map((file) => <div key={file.path}><span title={file.path}>assets/{file.path}</span>{file.dependency && <small>dependency</small>}<small>{formatSize(file.size)}</small></div>)}</div>
          {plan.files.length > shown && <button className="button secondary compact" disabled={busy} onClick={() => setShown((n) => n + 500)}>Show more files ({plan.files.length - shown} remaining)</button>}
          {busy && <div className="workflow-progress" role="status"><p><LoaderCircle size={14} className="spin" />{progress ? `Copying ${progress.copied} / ${progress.total} · ${formatSize(progress.bytes)} / ${formatSize(progress.totalBytes)}` : "Choose a destination outside the source project…"}</p>{progress && <><progress max={Math.max(1,progress.totalBytes)} value={progress.bytes} /><small>{progress.file}</small></>}</div>}
        </> : <>
          <div className="sheet-selection-actions"><button className="button secondary compact" disabled={busy} onClick={() => setChosen(new Set(candidates.map((a) => a.relativePath)))}>Select all {candidates.length}</button><button className="button secondary compact" disabled={busy} onClick={() => setChosen(new Set())}>Clear selection</button><span>{chosen.size} selected</span></div>
          {assets.length > 5000 && <p className="asset-tool-note">Showing the first 5,000 matching assets. Narrow the asset browser filters to choose a different collection.</p>}
          <div className="package-selection" aria-label="Assets to package">{candidates.slice(0,shown).map((asset) => <label key={asset.relativePath}><input type="checkbox" aria-label={`Package ${asset.relativePath}`} disabled={busy} checked={chosen.has(asset.relativePath)} onChange={(e) => setChosen((old) => { const next = new Set(old); if (e.target.checked) next.add(asset.relativePath); else next.delete(asset.relativePath); return next; })} /><span title={asset.relativePath}>{asset.relativePath}</span><small>{formatSize(asset.size)}</small></label>)}</div>
          {candidates.length > shown && <button className="button secondary compact" onClick={() => setShown((n) => n + 500)}>Show more assets</button>}
          <p className="asset-tool-note">Review first. The next step discovers GLTF dependencies and lists every proposed copy. Nothing is copied until you confirm and choose a destination.</p>
        </>}
        {error && <p className="asset-tool-note error" role="alert">{error}</p>}
      </div>
      <div className="modal-actions"><span className="asset-tool-note"><ShieldCheck size={13} />Local only · originals stay untouched</span>
        {mode === "health" ? <><button className="button secondary" disabled={busy} onClick={onClose}>Close</button><button className="button primary" disabled={busy} onClick={() => setAttempt((n) => n + 1)}>Run again</button></> : <>
          {busy && plan ? <button className="button secondary" onClick={() => void cancelPackage().catch((e) => setError(String(e)))}>Cancel collection</button> : <button className="button secondary" disabled={busy} onClick={onClose}>Close</button>}
          {plan && !busy && <button className="button secondary" onClick={reset}><ArrowLeft size={14} />Change selection</button>}
          {!result && <button className="button primary" disabled={busy || !chosen.size || !!plan?.issues.length} onClick={() => void (plan ? collect() : review())}>{busy && <LoaderCircle size={14} className="spin" />}{plan ? "Confirm & choose destination" : "Review package"}</button>}
        </>}
      </div>
    </Modal>
  );
}
