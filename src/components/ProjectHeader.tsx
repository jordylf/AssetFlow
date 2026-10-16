import {
  FolderOpen,
  RefreshCw,
  WandSparkles,
  HardDrive,
  Clock3,
} from "lucide-react";
import type { Project } from "../types";
import { formatDate, formatSize } from "../lib/format";
export function ProjectHeader({
  project,
  busy,
  onOpen,
  onOrganize,
  onRefresh,
}: {
  project: Project | null;
  busy: boolean;
  onOpen: () => void;
  onOrganize: () => void;
  onRefresh: () => void;
}) {
  const size = project?.assets.reduce((n, a) => n + a.size, 0) ?? 0;
  return (
    <header className="project-header">
      <div>
        <div className="eyebrow">A PLACE FOR EVERY PIECE</div>
        <h1>{project?.name || "Your work, in order."}</h1>
        <p className="project-path" title={project?.path}>
          {project ? (
            <>
              <FolderOpen size={13} />
              <span className="truncate">{project.path}</span>
              <button
                className="icon-button"
                title="Rescan project"
                aria-label="Rescan project"
                disabled={busy}
                onClick={onRefresh}
              >
                <RefreshCw size={13} />
              </button>
            </>
          ) : (
            "Less time looking. More time creating."
          )}
        </p>
        <div className="project-meta">
          <span>
            <HardDrive size={12} />
            {project
              ? `${project.assets.length.toLocaleString()} files · ${formatSize(size)}`
              : "All your creative assets, together"}
          </span>
          <i />
          <span>
            <Clock3 size={12} />
            {project
              ? `Scanned ${formatDate(project.scannedAt)}`
              : "Always local. Always yours."}
          </span>
        </div>
      </div>
      <div className="header-actions">
        <button className="button secondary" disabled={busy} onClick={onOpen}>
          <FolderOpen size={15} />
          Open Project Folder
        </button>
        <button
          className="button primary"
          disabled={busy || !project || !project.assets.length}
          onClick={onOrganize}
        >
          <WandSparkles size={15} />
          Organize Project
        </button>
      </div>
    </header>
  );
}
