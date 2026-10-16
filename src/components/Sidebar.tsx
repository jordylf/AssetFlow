import {
  ChevronRight,
  Clock3,
  FolderClosed,
  FolderPlus,
  HardDrive,
  Layers2,
  Settings2,
  Sparkles,
  Star,
} from "lucide-react";
import type { Project, View } from "../types";
import { motion } from "framer-motion";
import { navigateItems } from "../lib/keyboard";
interface Props {
  view: View;
  onView: (view: View) => void;
  onOpen: () => void;
  onSettings: () => void;
  project: Project | null;
  busy: boolean;
  favoriteCount: number;
}
export function Sidebar({
  view,
  onView,
  onOpen,
  onSettings,
  project,
  busy,
  favoriteCount,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Layers2 size={21} strokeWidth={2} />
        </span>
        <span>
          AssetFlow<span className="brand-dot">.</span>
        </span>
      </div>
      <div className="workspace-label">
        WORKSPACE <span>LOCAL</span>
      </div>
      <nav
        aria-label="Main navigation"
        onKeyDown={(event) => navigateItems(event, ".nav-item")}
      >
        {(
          [
            { name: "Projects", icon: FolderClosed },
            { name: "Recent", icon: Clock3 },
            { name: "Favorites", icon: Star },
          ] as const
        ).map(({ name, icon: Icon }) => (
          <button
            key={name}
            className={`nav-item ${view === name ? "active" : ""}`}
            aria-current={view === name ? "page" : undefined}
            onClick={() => onView(name)}
          >
            {view === name && (
              <motion.span
                className="nav-active-background"
                layoutId="sidebar-active"
                transition={{ type: "spring", stiffness: 450, damping: 38 }}
              />
            )}
            <Icon size={17} />
            <span>{name}</span>
            {name === "Projects" ? (
              <span className="nav-count">{project ? 1 : 0}</span>
            ) : name === "Favorites" && favoriteCount > 0 ? (
              <span className="nav-count">{favoriteCount}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="sidebar-section">
        <span>OPEN PROJECT</span>
        <button
          className="icon-button"
          title="Open project folder"
          aria-label="Open project folder"
          onClick={onOpen}
          disabled={busy}
        >
          <FolderPlus size={15} />
        </button>
      </div>
      {project ? (
        <button className="project-nav" onClick={() => onView("Projects")}>
          <span className="project-initial">
            {project.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{project.name}</span>
          <ChevronRight size={14} />
        </button>
      ) : (
        <div className="sidebar-hint">
          Your next great project
          <br />
          starts with a folder.
        </div>
      )}
      <div className="sidebar-bottom">
        <div className="local-note">
          <div className="local-note-icon">
            <HardDrive size={18} />
            <span className="status-dot" />
          </div>
          <strong>On your device. In your control.</strong>
          <p>Your creative work stays local.</p>
          <span className="local-pill">
            <Sparkles size={11} /> No uploads. No accounts.
          </span>
        </div>
        <button className="nav-item settings" onClick={onSettings}>
          <Settings2 size={17} />
          <span>Settings</span>
          <span className="version">v1.0</span>
        </button>
        <div className="sidebar-foot">
          <span className="creator-watermark">by <strong>odyworks</strong></span>
        </div>
      </div>
    </aside>
  );
}
