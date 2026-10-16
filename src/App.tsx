import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Info,
  List,
  LoaderCircle,
  Search,
  SearchX,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  WandSparkles,
  X,
} from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type {
  Asset,
  AssetCategory,
  AssetKind,
  OrganizationPlan,
  Project,
  RecentProject,
  View,
} from "./types";
import { Sidebar } from "./components/Sidebar";
import { ProjectHeader } from "./components/ProjectHeader";
import { StatCard } from "./components/StatCard";
import { SearchBar } from "./components/SearchBar";
import { AssetGrid } from "./components/AssetGrid";
import { AssetList } from "./components/AssetList";
import { EmptyState } from "./components/EmptyState";
import { StorageInsights } from "./components/StorageInsights";
import { OrganizationPreview } from "./components/OrganizationPreview";
import { Modal } from "./components/Modal";
import { AssetArtwork } from "./components/AssetCard";
import {
  CommandPalette,
  type PaletteCommand,
} from "./components/CommandPalette";
import { AssetLoading } from "./components/AssetLoading";
import { navigateItems } from "./lib/keyboard";
import {
  categories,
  categoryColors,
  formatDate,
  formatSize,
  readStored,
} from "./lib/format";
import {
  cancelOrganization,
  chooseProject,
  confirmOrganization,
  desktop,
  prepareOrganization,
  revealAsset,
  scanProject,
} from "./lib/filesystem";

const ModelInspector = lazy(() => import("./components/ModelInspector"));
const statTypes: { kind: AssetKind; category: AssetCategory }[] = [
  { kind: "Images", category: "References" },
  { kind: "Textures", category: "Textures" },
  { kind: "3D Models", category: "Models" },
  { kind: "Videos", category: "Video" },
  { kind: "Audio", category: "Audio" },
  { kind: "Design Files", category: "Design" },
  { kind: "Documents", category: "Documents" },
  { kind: "Other", category: "Other" },
];

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [view, setView] = useState<View>("Projects");
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [kind, setKind] = useState<AssetKind | null>(null);
  const [layout, setLayout] = useState<"grid" | "list">(() =>
    readStored("assetflow-layout", "grid"),
  );
  const [sort, setSort] = useState("name");
  const [limit, setLimit] = useState(60);
  const [favorites, setFavorites] = useState<string[]>(() =>
    readStored("assetflow-favorites", []),
  );
  const [recents, setRecents] = useState<RecentProject[]>(() =>
    readStored("assetflow-recents", []),
  );
  const [thumbnails, setThumbnails] = useState(() =>
    readStored("assetflow-thumbnails", true),
  );
  const [settings, setSettings] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchRequested, setSearchRequested] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropName, setDropName] = useState("");
  const [plan, setPlan] = useState<OrganizationPlan | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem("assetflow-favorites", JSON.stringify(favorites));
      localStorage.setItem("assetflow-recents", JSON.stringify(recents));
      localStorage.setItem("assetflow-layout", JSON.stringify(layout));
      localStorage.setItem("assetflow-thumbnails", JSON.stringify(thumbnails));
    } catch {
      /* Preferences are optional if local storage is unavailable. */
    }
  }, [favorites, recents, layout, thumbnails]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => setLimit(60), [query, category, kind, sort, view, project]);
  const loadProject = useCallback(async (path: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("Reading your project…");
    setError("");
    try {
      const next = await scanProject(path);
      setProject(next);
      setView("Projects");
      setQuery("");
      setCategory("All");
      setKind(null);
      setSelected(null);
      setPlan(null);
      setRecents((old) =>
        [
          { name: next.name, path: next.path, openedAt: Date.now() },
          ...old.filter((p) => p.path !== next.path),
        ].slice(0, 12),
      );
      setToast(
        `${next.assets.length.toLocaleString()} assets found. Your project is ready.`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }, []);
  const openProject = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const path = await chooseProject();
      if (path) await loadProject(path);
    } catch (e) {
      setError(String(e));
    }
  }, [loadProject]);
  const focusSearch = useCallback(() => {
    setView("Projects");
    setSearchRequested(true);
  }, []);
  useEffect(() => {
    if (!searchRequested || view === "Recent" || paletteOpen) return;
    const frame = requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
      setSearchRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [searchRequested, view, paletteOpen]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (
          !e.repeat &&
          (paletteOpen || !document.querySelector("dialog[open]"))
        )
          setPaletteOpen((open) => !open);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (!e.repeat && !document.querySelector("dialog[open]"))
          void openProject();
      }
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest('input, textarea, select, [contenteditable="true"]')
        ) &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [openProject, paletteOpen, focusSearch]);
  useEffect(() => {
    if (!desktop) return;
    let dispose: (() => void) | undefined;
    let active = true;
    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (!active) return;
        const payload = event.payload;
        if (payload.type === "enter") {
          setDropName(
            payload.paths[0]
              ?.replace(/\\/g, "/")
              .split("/")
              .filter(Boolean)
              .pop() ?? "Project folder",
          );
          setDragging(!document.querySelector("dialog[open]"));
        }
        if (payload.type === "leave") setDragging(false);
        if (payload.type === "drop") {
          setDragging(false);
          if (!document.querySelector("dialog[open]") && payload.paths[0])
            void loadProject(payload.paths[0]);
        }
      })
      .then((fn) => {
        if (active) dispose = fn;
        else fn();
      })
      .catch((e) => setError(`Folder drop is unavailable: ${e}`));
    return () => {
      active = false;
      dispose?.();
    };
  }, [loadProject]);
  const favorite = (path: string) =>
    setFavorites((old) =>
      old.includes(path) ? old.filter((p) => p !== path) : [...old, path],
    );
  const assets = project?.assets ?? [];
  const filtered = useMemo(
    () =>
      assets
        .filter(
          (a) =>
            (view !== "Favorites" || favorites.includes(a.path)) &&
            (category === "All" || a.category === category) &&
            (!kind || a.kind === kind) &&
            `${a.name} ${a.relativePath} ${a.extension} ${a.category}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "size"
            ? b.size - a.size
            : sort === "modified"
              ? b.modified - a.modified
              : a.name.localeCompare(b.name, undefined, { numeric: true }),
        ),
    [assets, view, favorites, category, kind, query, sort],
  );
  const startOrganization = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("Preparing a safe preview…");
    setError("");
    try {
      setPlan(await prepareOrganization());
    } catch (e) {
      setError(String(e));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };
  const closePlan = () => {
    setPlan(null);
    void cancelOrganization().catch((e) => setError(String(e)));
  };
  const organize = async () => {
    if (!plan || !project || busyRef.current) return;
    busyRef.current = true;
    setBusy("Organizing your project…");
    setError("");
    try {
      const result = await confirmOrganization(plan.id);
      const next = await scanProject(project.path);
      const moved = plan.operations.slice(0, result.moved);
      setFavorites((old) =>
        old.map((path) => {
          const asset = project.assets.find((a) => a.path === path);
          const move = moved.find((m) => m.from === asset?.relativePath);
          return move
            ? (next.assets.find((a) => a.relativePath === move.to)?.path ??
                path)
            : path;
        }),
      );
      setProject(next);
      setPlan(null);
      setToast(
        `${result.moved} ${result.moved === 1 ? "asset" : "assets"} organized.`,
      );
      if (result.errors.length)
        setError(
          `${result.moved} files moved before stopping. ${result.errors.join(" ")}`,
        );
    } catch (e) {
      setPlan(null);
      setError(`${String(e)} Rescan the project before trying again.`);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };
  const changeView = (next: View) => {
    setView(next);
    setQuery("");
    setCategory("All");
    setKind(null);
  };
  const activeCount = assets.filter((a) => favorites.includes(a.path)).length;
  const favoritesEmpty =
    view === "Favorites" &&
    !activeCount &&
    !query &&
    category === "All" &&
    !kind;
  const commands: PaletteCommand[] = [
    {
      id: "open",
      label: "Open Project",
      detail: busy
        ? "Available when the current task finishes"
        : "Choose a folder from your device",
      icon: FolderOpen,
      shortcut: "Ctrl O",
      disabled: !!busy,
    },
    {
      id: "search",
      label: "Search Assets",
      detail: "Find a file by name, type, or path",
      icon: Search,
      shortcut: "/",
    },
    {
      id: "organize",
      label: "Organize Project",
      detail: busy
        ? "Available when the current task finishes"
        : project?.assets.length
          ? "Review proposed moves before making changes"
          : "Open a project with assets first",
      icon: WandSparkles,
      disabled: !!busy || !project?.assets.length,
    },
    {
      id: "grid",
      label: "Grid View",
      detail: "Browse with image previews and file cards",
      icon: Grid2X2,
      active: layout === "grid",
    },
    {
      id: "list",
      label: "List View",
      detail: "Compare file details in a compact list",
      icon: List,
      active: layout === "list",
    },
    {
      id: "settings",
      label: "Open Settings",
      detail: "Preferences, privacy, and keyboard shortcuts",
      icon: Settings2,
    },
  ];
  const runCommand = (id: string) => {
    if (commands.find((command) => command.id === id)?.disabled) return;
    setPaletteOpen(false);
    // Let the native dialog restore focus before opening another dialog or focusing search.
    requestAnimationFrame(() => {
      if (id === "open") void openProject();
      if (id === "search") focusSearch();
      if (id === "organize") void startOrganization();
      if (id === "grid" || id === "list") {
        setLayout(id);
        if (view === "Recent") setView("Projects");
      }
      if (id === "settings") setSettings(true);
    });
  };
  const scanning = busy === "Reading your project…";
  return (
    <div className={`app-shell ${busy ? "is-busy" : ""}`}>
      <Sidebar
        view={view}
        onView={changeView}
        onOpen={() => void openProject()}
        onSettings={() => setSettings(true)}
        project={project}
        busy={!!busy}
        favoriteCount={activeCount}
      />
      <main className="main-shell">
        <div className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <span>{view}</span>
            {project && view === "Projects" && (
              <>
                <ChevronRight size={13} />
                <strong>{project.name}</strong>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <button
              className="command-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
            >
              <Search size={13} />
              <span>Commands</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="workspace-status">
              <span className="status-dot" />
              Local workspace
              <HardDrive size={13} />
            </span>
          </div>
        </div>
        <div className="main-scroll">
          <div className="main-content">
            {view === "Recent" ? (
              <header className="recent-header">
                <div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div>
                <h1>Recently opened</h1>
                <p>Your projects. One folder away.</p>
              </header>
            ) : (
              <ProjectHeader
                project={project}
                busy={!!busy}
                onOpen={() => void openProject()}
                onOrganize={() => void startOrganization()}
                onRefresh={() => project && void loadProject(project.path)}
              />
            )}
            {error && (
              <div className="error-banner" role="alert">
                <CircleAlert size={18} />
                <span>{error}</span>
                <button
                  className="icon-button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {!desktop && (
              <div className="browser-notice">
                <Info size={15} />
                <span>
                  You're viewing the interface in a browser. Open the desktop
                  app for local folder access.
                </span>
              </div>
            )}
            {view === "Recent" ? (
              <div className="recent-projects">
                {recents.length ? (
                  recents.map((p) => (
                    <button
                      key={p.path}
                      className="recent-card"
                      onClick={() => void loadProject(p.path)}
                      disabled={!!busy}
                    >
                      <div className="recent-folder">
                        <FolderOpen size={25} />
                      </div>
                      <div>
                        <h3>{p.name}</h3>
                        <p title={p.path}>{p.path}</p>
                        <span>
                          <Clock3 size={12} />
                          Opened {formatDate(p.openedAt)}
                        </span>
                      </div>
                      <ArrowRight size={18} />
                    </button>
                  ))
                ) : (
                  <div className="simple-empty">
                    <Clock3 size={32} />
                    <h2>A fresh start.</h2>
                    <p>Projects you open will appear here.</p>
                    <button
                      className="button primary"
                      onClick={() => void openProject()}
                    >
                      Open Project Folder
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div
                  className="stats-grid"
                  aria-label="Project statistics"
                  onKeyDown={(event) => navigateItems(event, ".stat-card")}
                >
                  {statTypes.map(
                    ({ kind: statKind, category: statCategory }) => {
                      const matches = assets.filter((a) => a.kind === statKind);
                      return (
                        <StatCard
                          key={statKind}
                          label={statKind}
                          category={statCategory}
                          count={matches.length}
                          size={matches.reduce((n, a) => n + a.size, 0)}
                          total={assets.length}
                          active={kind === statKind}
                          onClick={() => {
                            setKind(kind === statKind ? null : statKind);
                            setCategory("All");
                          }}
                        />
                      );
                    },
                  )}
                </div>
                <div className="work-area">
                  <section className="asset-browser" aria-busy={scanning}>
                    <div className="browser-heading">
                      <div>
                        <h2>
                          {view === "Favorites"
                            ? "Favorite assets"
                            : "Asset library"}
                          <span>
                            {view === "Favorites" ? activeCount : assets.length}
                          </span>
                        </h2>
                        <p>
                          {view === "Favorites"
                            ? "The pieces you keep coming back to."
                            : "Every piece of your project. One place."}
                        </p>
                      </div>
                      <span className="scan-badge">
                        <span className="status-dot" />
                        {project ? "Indexed locally" : "Ready when you are"}
                      </span>
                    </div>
                    <div className="browser-toolbar">
                      <SearchBar
                        value={query}
                        onChange={setQuery}
                        inputRef={searchRef}
                      />
                      <div className="sort-select">
                        <ArrowDownWideNarrow size={14} />
                        <select
                          aria-label="Sort assets"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="name">Name</option>
                          <option value="modified">Last modified</option>
                          <option value="size">Largest first</option>
                        </select>
                        <ChevronDown size={12} />
                      </div>
                      <div
                        className="view-toggle"
                        role="group"
                        aria-label="Asset view"
                      >
                        <button
                          className={layout === "grid" ? "active" : ""}
                          title="Grid view"
                          aria-label="Grid view"
                          aria-pressed={layout === "grid"}
                          onClick={() => setLayout("grid")}
                        >
                          <Grid2X2 size={15} />
                        </button>
                        <button
                          className={layout === "list" ? "active" : ""}
                          title="List view"
                          aria-label="List view"
                          aria-pressed={layout === "list"}
                          onClick={() => setLayout("list")}
                        >
                          <List size={17} />
                        </button>
                      </div>
                    </div>
                    <div
                      className="category-tabs"
                      aria-label="Filter assets by category"
                      onKeyDown={(event) => navigateItems(event, "button")}
                    >
                      <button
                        className={category === "All" && !kind ? "active" : ""}
                        aria-pressed={category === "All" && !kind}
                        onClick={() => {
                          setCategory("All");
                          setKind(null);
                        }}
                      >
                        All assets
                      </button>
                      {(
                        [
                          "References",
                          "Design",
                          "Models",
                          "Textures",
                          "Video",
                          "Audio",
                        ] as const
                      ).map((c) => (
                        <button
                          key={c}
                          className={category === c ? "active" : ""}
                          aria-pressed={category === c}
                          onClick={() => {
                            setCategory(c);
                            setKind(null);
                          }}
                        >
                          {c}
                        </button>
                      ))}
                      <label
                        className={`more-filter ${["Exports", "Documents", "Other"].includes(category) ? "active" : ""}`}
                      >
                        <SlidersHorizontal size={13} />
                        <select
                          aria-label="More categories"
                          value={
                            ["Exports", "Documents", "Other"].includes(category)
                              ? category
                              : ""
                          }
                          onChange={(e) => {
                            setCategory(e.target.value || "All");
                            setKind(null);
                          }}
                        >
                          <option value="">More</option>
                          {categories
                            .filter((c) =>
                              ["Exports", "Documents", "Other"].includes(c),
                            )
                            .map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                        </select>
                      </label>
                    </div>
                    {kind && (
                      <div className="filter-chip">
                        {kind}
                        <button
                          className="icon-button"
                          onClick={() => setKind(null)}
                          aria-label="Clear type filter"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    {scanning ? (
                      <AssetLoading />
                    ) : !project ? (
                      <EmptyState
                        onOpen={() => void openProject()}
                        busy={!!busy}
                      />
                    ) : filtered.length ? (
                      <>
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={layout}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.14 }}
                          >
                            {layout === "grid" ? (
                              <AssetGrid
                                assets={filtered.slice(0, limit)}
                                favorites={favorites}
                                onFavorite={favorite}
                                onSelect={setSelected}
                                thumbnails={thumbnails}
                              />
                            ) : (
                              <AssetList
                                assets={filtered.slice(0, limit)}
                                favorites={favorites}
                                onFavorite={favorite}
                                onSelect={setSelected}
                              />
                            )}
                          </motion.div>
                        </AnimatePresence>
                        {filtered.length > limit && (
                          <button
                            className="button secondary load-more"
                            onClick={() => setLimit((n) => n + 60)}
                          >
                            Show more assets ({filtered.length - limit}{" "}
                            remaining)
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="simple-empty">
                        {view === "Favorites" ? (
                          <Star size={32} />
                        ) : (
                          <SearchX size={32} />
                        )}
                        <h2>
                          {favoritesEmpty
                            ? "Keep your favorites close."
                            : assets.length
                              ? query
                                ? `No matches for “${query.length > 32 ? query.slice(0, 32) + "…" : query}”`
                                : "No assets in this category."
                              : "Your project is a blank canvas."}
                        </h2>
                        <p>
                          {favoritesEmpty
                            ? "Star an asset to keep it close."
                            : assets.length
                              ? "Try another search or clear your filters."
                              : "Add files to this folder, then rescan your project."}
                        </p>
                        {
                          <button
                            className="button secondary"
                            disabled={!!busy}
                            onClick={() => {
                              if (!assets.length) {
                                if (project) void loadProject(project.path);
                                return;
                              }
                              if (favoritesEmpty) {
                                changeView("Projects");
                                return;
                              }
                              setQuery("");
                              setCategory("All");
                              setKind(null);
                            }}
                          >
                            {!assets.length
                              ? "Rescan project"
                              : favoritesEmpty
                                ? "Browse all assets"
                                : "Clear filters"}
                          </button>
                        }
                      </div>
                    )}
                    {project && !scanning && (
                      <div className="library-footer">
                        <span>
                          {Math.min(limit, filtered.length)} of{" "}
                          {filtered.length.toLocaleString()} assets
                          <span className="footer-separator">·</span>
                          {formatSize(filtered.reduce((n, a) => n + a.size, 0))}
                        </span>
                        <span className="keyboard-hint">
                          <kbd>↑</kbd>
                          <kbd>↓</kbd> navigate <kbd>↵</kbd> inspect
                        </span>
                      </div>
                    )}
                  </section>
                  <StorageInsights assets={assets} onSelect={setSelected} />
                </div>
                {project && project.warnings.length > 0 && (
                  <details className="scan-warnings">
                    <summary>
                      {project.warnings.length} scan warnings · some files could
                      not be indexed
                    </summary>
                    {project.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </details>
                )}
              </>
            )}
          </div>
          <footer className="app-footer">
            <span>
              <ShieldCheck size={12} />
              Your files stay on your device.
            </span>
            <span>
              Designed for a little more flow.
              <span className="footer-dot" />
            </span>
          </footer>
        </div>
      </main>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            style={{ x: "-50%" }}
            role="status"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <span>
              <Check size={15} />
            </span>
            {toast}
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {busy && !plan && (
          <motion.div
            className="busy-indicator"
            role="status"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <LoaderCircle size={16} className="spin" />
            {busy}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dragging && (
          <motion.div
            className={`drop-overlay ${busy ? "drop-busy" : ""}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            role="status"
          >
            <motion.div
              className="drop-card"
              initial={{ y: 8, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              transition={{ duration: 0.18 }}
            >
              <span className="drop-folder-icon">
                <FolderOpen size={34} strokeWidth={1.4} />
              </span>
              <span className="eyebrow">
                {busy ? "ONE MOMENT" : "OPEN A LOCAL PROJECT"}
              </span>
              <h2>
                {busy
                  ? "An operation is still in progress."
                  : "Drop it here. We’ll take a look."}
              </h2>
              <p>
                {busy
                  ? "Finish the current operation, then drop your folder again."
                  : "Your files stay exactly where they are."}
              </p>
              {!busy && (
                <span className="drop-filename">
                  <FolderOpen size={14} />
                  {dropName}
                </span>
              )}
              <span className="drop-safety">
                <ShieldCheck size={13} /> Read-only import · Nothing is uploaded
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onRun={runCommand}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {plan && (
        <OrganizationPreview
          plan={plan}
          busy={!!busy}
          onClose={closePlan}
          onConfirm={() => void organize()}
        />
      )}
      {settings && (
        <Modal title="Settings" onClose={() => setSettings(false)}>
          <div className="settings-content">
            <div className="settings-brand">
              <span className="brand-mark">
                <HardDrive size={23} />
              </span>
              <div>
                <h3>Local is a feature.</h3>
                <p>No accounts. No uploads. Just your work.</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>Image thumbnails</strong>
                <p>Preview supported images in the asset grid.</p>
              </div>
              <button
                role="switch"
                aria-checked={thumbnails}
                aria-label="Image thumbnails"
                className={`switch ${thumbnails ? "on" : ""}`}
                onClick={() => setThumbnails((v) => !v)}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Recently opened projects</strong>
                <p>Remove saved paths from this device.</p>
              </div>
              <button
                className="button secondary compact"
                onClick={() => {
                  setRecents([]);
                  setToast("Recent project history cleared.");
                }}
                disabled={!recents.length}
              >
                Clear history
              </button>
            </div>
            <div className="keyboard-help">
              <span>
                Command palette <kbd>Ctrl K</kbd>
              </span>
              <span>
                Open project <kbd>Ctrl O</kbd>
              </span>
              <span>
                Search assets <kbd>/</kbd>
              </span>
              <span>
                Navigate files <kbd>Arrow keys</kbd>
              </span>
              <span>
                Inspect file <kbd>Enter</kbd>
              </span>
            </div>
            <div className="settings-safety">
              <ShieldCheck size={18} />
              <p>
                Importing never changes files. Organization always requires a
                preview and explicit confirmation. Links and junctions are
                skipped for safety.
              </p>
            </div>
            <p className="settings-version">
              AssetFlow 1.0.0 · Made for the creative process
            </p>
          </div>
        </Modal>
      )}
      {selected && ["glb", "gltf"].includes(selected.extension) ? (
        <Modal
          title="3D asset inspector"
          onClose={() => setSelected(null)}
          className="model-inspector"
          hideHeading
        >
          <Suspense
            fallback={
              <div className="model-module-loading" role="status">
                <LoaderCircle size={24} className="spin" />
                <span>Opening 3D inspector…</span>
              </div>
            }
          >
            <ModelInspector
              key={selected.path}
              asset={selected}
              favorite={favorites.includes(selected.path)}
              onFavorite={() => favorite(selected.path)}
              onClose={() => setSelected(null)}
            />
          </Suspense>
        </Modal>
      ) : (
        selected && (
          <Modal title="Asset details" onClose={() => setSelected(null)}>
            <div className="asset-details">
              <AssetArtwork
                key={selected.path}
                asset={selected}
                thumbnails={thumbnails}
              />
              <div className="detail-title">
                <h3>{selected.name}</h3>
                <button
                  className={`icon-button ${favorites.includes(selected.path) ? "is-favorite" : ""}`}
                  aria-label="Toggle favorite"
                  onClick={() => favorite(selected.path)}
                >
                  <Star
                    size={18}
                    fill={
                      favorites.includes(selected.path)
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>
              </div>
              <dl>
                <div>
                  <dt>Category</dt>
                  <dd>
                    <i
                      className="category-dot"
                      style={{ background: categoryColors[selected.category] }}
                    />
                    {selected.category}
                  </dd>
                </div>
                <div>
                  <dt>File type</dt>
                  <dd>{selected.extension.toUpperCase() || "Unknown"}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatSize(selected.size)}</dd>
                </div>
                <div>
                  <dt>Modified</dt>
                  <dd>{formatDate(selected.modified)}</dd>
                </div>
                <div className="detail-path">
                  <dt>Project path</dt>
                  <dd>{selected.relativePath}</dd>
                </div>
              </dl>
              <button
                className="button secondary full-width"
                onClick={() =>
                  void revealAsset(selected.path).catch((e) => {
                    setSelected(null);
                    setError(String(e));
                  })
                }
              >
                <FolderOpen size={15} />
                Show in File Explorer
              </button>
            </div>
          </Modal>
        )
      )}
    </div>
  );
}
