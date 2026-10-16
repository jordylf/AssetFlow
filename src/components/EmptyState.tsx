import {
  ArrowRight,
  Box,
  FileImage,
  FolderOpen,
  Layers,
  MousePointer2,
  Plus,
  ScanLine,
} from "lucide-react";
import { motion } from "framer-motion";
export function EmptyState({
  onOpen,
  busy,
}: {
  onOpen: () => void;
  busy: boolean;
}) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="empty-art" aria-hidden="true">
        <div className="empty-grid" />
        <div className="floating-tile tile-one">
          <FileImage size={25} />
          <span>reference.jpg</span>
        </div>
        <div className="floating-tile tile-two">
          <Box size={25} />
          <span>scene.blend</span>
        </div>
        <div className="floating-tile tile-three">
          <ScanLine size={24} />
          <span>material.png</span>
        </div>
        <div className="folder-art">
          <div className="folder-tab" />
          <div className="folder-body">
            <Layers size={40} strokeWidth={1.3} />
            <span className="folder-plus">
              <Plus size={17} />
            </span>
          </div>
        </div>
        <span className="art-cursor">
          <MousePointer2 size={20} fill="currentColor" />
        </span>
      </div>
      <span className="eyebrow mint">YOUR NEXT PROJECT STARTS HERE</span>
      <h2>A clear space for creative work.</h2>
      <p>
        Open a folder to bring every reference, texture,
        <br />
        and working file into view.
      </p>
      <button className="button primary" onClick={onOpen} disabled={busy}>
        <FolderOpen size={16} />
        Open Project Folder
        <ArrowRight size={15} />
      </button>
      <div className="drop-hint">
        or drop a project folder here <span>·</span> <kbd>Ctrl O</kbd>
      </div>
      <div className="empty-promises">
        <span>
          <i />
          No uploads
        </span>
        <span>
          <i />
          No file changes on import
        </span>
        <span>
          <i />
          No clutter
        </span>
      </div>
    </motion.div>
  );
}
