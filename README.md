# AssetFlow

**Your creative work, in order.** A Windows desktop workspace for designers, 3D artists, video editors, and developers. Crafted **by odyworks**.

**English** · [Bahasa Indonesia](README.id.md)

Built with Tauri 2, Rust, React, TypeScript, Tailwind CSS, Lucide, Framer Motion, React Three Fiber, and Three.js. Everything runs locally, with a compact dark interface and keyboard-driven interactions. The application interface currently uses English; documentation is available in both languages.

![AssetFlow desktop workspace](docs/images/workspace.png)

## Features

| Feature | What it does |
| --- | --- |
| Project import | Open or drop a folder and recursively scan regular files without modifying them. |
| Asset browser | Grid/list views, small cached thumbnails where supported, category filters, and sorting by name, size, or modification time. |
| Search | Find assets by filename, path, extension, or category. |
| Project statistics | Counts for images, textures, models, video, audio, design files, documents, and other files. |
| Storage Insights | Total size, category distribution by bytes, and the four largest assets. |
| Favorites and recents | Star assets and reopen project folders with locally stored preferences. |
| Organization preview | Review every proposed source/destination before confirming moves. |
| Keep dependencies together | GLTF/GLB models move as one folder with the local buffers and textures they reference, including resources shared by several models. |
| Undo organization | Restore the last organization after reviewing a preview; the move journal survives restarts. |
| Conflict handling | Existing files are never overwritten; conflicts receive numbered suffixes. |
| Image preview | Zoom, pan, fit/100%, pixel dimensions, and a checkerboard behind transparency. |
| Video/audio preview | Local playback with seek and volume, duration, video resolution, and a clear fallback for unsupported codecs. |
| 3D inspector | GLB/GLTF studio viewport, controls, geometry counts, materials, textures, and bounds. |
| Open With | Choose a Windows application from file details or an image/media/3D inspector. |
| Technical metadata | Read codec, frame rate, pixel/color information, bitrate and audio properties on demand with optional local ffprobe. |
| Contact sheet | Select up to 200 filtered assets and export a standalone printable HTML catalog with embedded thumbnails. |
| Command palette | Ctrl+K opens common actions, including Create Contact Sheet, with keyboard navigation. |

## Install on Windows

Windows x64 is the current build target. When packaged binaries are published, download them from [GitHub Releases](https://github.com/jordylf/AssetFlow/releases):

- `AssetFlow_1.0.0_x64-setup.exe`: install for the current Windows user.
- `AssetFlow.exe`: run the standalone application directly.

Microsoft Edge WebView2 Runtime is required. The 3D inspector also needs WebGL hardware acceleration. If no release is available, build from source below. Compiled binaries are excluded from the source repository; local packaged copies can be kept in `release/`.

## Run

```powershell
git clone https://github.com/jordylf/AssetFlow.git
cd AssetFlow
npm ci
npm run desktop
```

Development prerequisites: Node.js 20.19+ or 22.12+ with npm for Vite 7, Microsoft C++ Build Tools with a Windows SDK, the stable MSVC Rust toolchain, and WebView2. The desktop launcher also finds Rust in the default user `.cargo/bin` directory. Decoder assets are prepared automatically before frontend development and builds.

```powershell
npm run build          # TypeScript check and production frontend
npm run test:rust      # Classification and real filesystem safety tests
npm run desktop:build # Native executable and NSIS Windows installer
npm run sample         # Create a NEW disposable sample project in Windows Temp
npm run bench          # Measure the release build with disposable fixtures (needs Playwright)
```

Installer output: `src-tauri/target/release/bundle/nsis/`. Standalone app: `src-tauri/target/release/assetflow.exe`.

`npm run dev` previews the interface in a browser; native folder operations require `npm run desktop` or the built executable.

## Use

Open a project folder or drop a folder into the app. Browse every regular file recursively, search names and paths, filter by category or file type, sort by name/size/modified time, and switch between grid and list views. Star files to save favorites. Recent paths, favorites, view preferences, and thumbnail settings are stored locally; file contents are never uploaded or indexed in a database.

Press **Ctrl+K** for the command palette: Open Project, Search Assets, Organize Project, Undo Last Organization, Grid View, List View, and Open Settings. Type to filter, use Up/Down to navigate, Enter to run, and Escape to close and restore focus. Organize Project always opens the existing confirmation preview.

**Ctrl+O** opens a project; **/** focuses asset search when you're not typing in another field. From search, press Down to enter the file collection. Arrow keys navigate file cards and list rows; Enter inspects a file. Home/End jump to the first/last item. Sidebar navigation, category filters, and project statistics also support arrow keys. Escape clears an asset search or closes the active dialog. Dialogs keep keyboard focus inside while open, and restore it on close. Reduced-motion system preferences are respected.

Select an asset for its metadata and **Show in File Explorer**. Browser-supported raster images have thumbnails; other formats use type icons. Thumbnails are decoded once, reduced to card size, kept in a 32 MB in-memory cache, generated at most three at a time, and only loaded for cards near the visible area. Storage Insights shows project size, category shares by bytes, and the four largest files.

## Image, video, and audio preview

PNG, JPG, WEBP, GIF, AVIF, BMP, and SVG files open in an image viewer: wheel or **+**/**−** to zoom around the cursor, drag or arrow keys to pan, **0** or double-click to fit, **1** for actual size. The panel shows pixel dimensions and zoom; transparent areas sit on a checkerboard. The full-size image is released when the viewer closes.

MP4, MOV, WEBM, and MKV videos and WAV, MP3, FLAC, and AAC audio play locally with the built-in controls (play, seek, volume). Only metadata is loaded first (`preload="metadata"`) to show duration and video resolution; playback stops and the decoder is released when the preview closes. Playback depends on the codecs available to WebView2 on that PC: unsupported codecs or containers (often MKV or some professional MOV codecs) show a clear message instead of a broken player. Audio waveforms are not drawn, to avoid decoding whole files.

## Live folder updates

The active project is watched using native filesystem notifications (`ReadDirectoryChangesW` on Windows via notify), not a periodic polling scan. File creation, saves, renames, removals and nested-folder changes are merged into batches after roughly 450 ms of quiet, or after two seconds during a continuous burst. A background project snapshot then reconciles the asset list, counts and thumbnails. Updates preserve search, category, view, sort order and the number of loaded cards. The snapshot currently rescans the project; per-folder incremental indexing is not implemented.

Use **Live folder** to pause/resume, or the **Live folder updates** setting. Manual rescan remains available. Refreshing waits while an inspector, command palette, organization/undo preview, contact sheet, health check or packaging dialog is open, and applies queued changes afterward. It never automatically organizes files. Thumbnails use size/modification-time cache keys and versioned asset URLs so saved images reload.

Switching projects replaces the watcher. **Close project** next to the project path, or **Close Project** in Ctrl+K, releases the current project and watcher. Errors offer retry; unsupported filesystems may require manual rescans. An externally renamed/removed project root may need to be reopened. Favorites remain path-based, so external renames do not automatically transfer favorite marks. Pause live updates during large ongoing builds if repeated project snapshots are undesirable.

## Project Health Check

Choose **Health check** above the asset browser or **Project Health Check** from Ctrl+K. This read-only operation scans the current project and checks every GLTF/GLB manifest for missing resources, remote/absolute/out-of-project references, unsafe links, and unreadable or invalid manifests. It also reports scan warnings, zero-byte files, and assets of 512 MiB or more. All errors and warnings are counted; at most 1,000 findings are displayed.

The report lists the referring model and each resource issue, rather than stopping at the first broken URI. Fix the source files in their original applications, then choose **Run again**. Large/empty files are review warnings, not automatically corrupt files. This is a dependency/metadata check, not a complete semantic glTF validator, renderer test, malware scan, or validator for Blender/Adobe/video-editor projects.

## Collect & Package

Choose **Collect & package** or the matching Ctrl+K command. The selection follows current browser filters/sort: up to 5,000 candidates, initially the first 60 selected, with a paged list. **Review package** resolves forward GLTF/GLB dependencies and shows every file to copy, added dependencies, total bytes and limitations. Shared resources are copied only once. Missing/unsafe model dependencies block confirmation until fixed.

Only **Confirm & choose destination** starts collection, after a native folder picker. Choose a destination outside the source project. AssetFlow reserves a new `AssetFlow-package-<timestamp>` folder; original files are never moved, renamed, overwritten or deleted. Source-relative paths are preserved below `assets/`, so supported relative GLTF references do not need rewriting. Selecting only a texture does not automatically collect every model that uses it. Non-GLTF dependencies are not discovered.

Each file is streamed through a 128 KiB buffer while calculating SHA-256; files are not read wholly into memory. Progress reports bytes and files. Source metadata is checked before copying, after each file, and before finalizing the package. These are size/time checks, not a filesystem transaction or protection against all concurrent external edits. Copies contain the read bytes' SHA-256 in `manifest.json`; verify checksums when receiving a package.

Output contains `assets/`, `README.txt`, `PACKAGE_STATUS.txt`, and, only on success, an atomically published `manifest.json` with `complete: true`. The status note remains present and explains that the valid completion manifest is authoritative. Cancel or failure retains partial output for inspection, without a completion manifest. Do not share it as a complete package; collect again into a new folder. **Cancel collection** stops at a subsequent read/write chunk (a blocked OS/network I/O call may take longer). The native destination picker has its own Cancel button. The app does not delete partial output automatically.

The output is a folder, not a ZIP archive. Preview is limited to 10,000 files including dependencies. **Open package folder** reveals a completed or partial result. Dependency analysis currently covers GLTF/GLB buffers and images only; Blender, Adobe, video editing and source-code references still require review.

## Open With and technical metadata

**Open with…** in asset details and all inspectors opens the native Windows application chooser. Only regular files inside the active project are accepted; links, escaping paths, executable files and shortcuts are rejected. Cancelling does not modify the asset. An external application may modify a file after you open it, according to the actions you take there.

Image and media previews have a **Read technical metadata** action. It uses `ffprobe.exe` from an absolute directory on the process PATH; FFmpeg is optional and is not bundled. After installing FFmpeg, restart AssetFlow so it receives the updated PATH. Existing previews, file details, and contact sheets work without it.

Reported fields include container, codec/profile, encoded dimensions, reported frame rate, bitrate, pixel format, reported bit depth/color properties, audio codec, sample rate, channel layout and sample format. Missing fields are omitted rather than inferred. EXIF and ICC profile extraction are not included. Image aspect ratio is also shown alongside the existing decoded dimensions. Frame rate is stream metadata, not a full frame-by-frame analysis.

Probing is opt-in, runs once per request, allows only one process at a time, uses one decoder thread, caps individual FFmpeg allocations at 64 MiB, limits output to 256 KiB, and kills the process after eight seconds. This is not a universal total-memory cap. Network protocols and playlist demuxers are disabled. Closing the preview discards late results; an active probe finishes or reaches its timeout. Damaged files, unavailable ffprobe, and timeouts have explicit messages.

## Contact sheets

Use **Contact sheet** above the asset browser or **Create Contact Sheet** from Ctrl+K. The dialog follows the current search, filters and sort order. It offers the first 200 results, selects the first 60 initially, and lets you choose individual assets, a title, 2–4 columns, and optional image thumbnails. Narrow the browser filters when you need a different set.

Export produces a new `.html` file chosen in the native Save dialog. Existing files are never overwritten, even after an operating-system overwrite prompt. Use a different filename if the target already exists. The self-contained file includes escaped names, project-relative paths, extensions, byte sizes, a `by odyworks` credit and embedded WebP thumbnails. It contains no source assets, scripts, remote requests, or absolute project paths. Review relative paths and names before sharing.

Raster thumbnails are prepared sequentially, limited to 360×240 pixels. Unsupported/unreadable images, sources larger than 24 MiB, and thumbnails taking over six seconds use format labels. Model/video/audio entries use labels; exporting does not render every model or decode videos. Preparation can be cancelled before the Save dialog; cancel that native dialog to abandon saving. The export is limited to 200 entries and 12 MiB of thumbnail text. Small compressed images can still require a larger temporary decode in WebView2.

After saving, choose **Open in browser / print**, then use the browser's Print command (Ctrl+P) to print or Save as PDF. AssetFlow exports HTML directly; PDF is produced by the browser's print system. Source files are never moved or modified by export.

## 3D asset inspector

![AssetFlow 3D inspector with a sample GLB](docs/images/model-inspector.png)

Select a `.glb` or `.gltf` file in either view to open the inspector. The lazy-loaded React Three Fiber / Three.js viewport provides orbit controls, wheel and button zoom, automatic centering/framing, neutral studio lighting, grid and wireframe toggles, and camera reset. Drag to orbit, right-drag to pan, and scroll to zoom. Focus the viewport and press **R** to fit the model again; arrow keys pan. **Escape** closes the inspector and restores focus.

The details panel shows file name, size, format, modification date, vertex and triangle counts, materials, textures with image dimensions, and the source-space axis-aligned bounding box. Geometry totals count meshes in the default scene, including instances. The default scene is inspected in its static pose; source cameras and lights do not replace the studio setup. Preview centering, lighting, camera changes, and wireframe never alter the source model or its materials on disk.

Embedded GLB resources, embedded data URIs, and relative GLTF buffers/textures are supported. Resource paths may reference sibling folders inside the open project, including percent-encoded names. Rust validates every local resource against the project root and rejects escaping paths, junctions, and symbolic-link dependencies. Remote resource URLs and absolute references are rejected. Missing or invalid files produce an error with a retry action. Draco, Meshopt, and KTX2/Basis decoding runs locally with bundled decoders; no CDN is needed. The viewport renders on demand and disposes its model geometry, materials, textures, image bitmaps, and decoder workers when closed.

The lightweight inspector allows 512 MiB per local resource and 768 MiB of loaded source resources per model. WebGL hardware acceleration is required. The organizer keeps GLTF/GLB resources together (see below) but never rewrites model files.

## Organization and safety

**Organize Project** scans the current project again and creates a backend-owned preview. Cancel does not move anything. Only **Confirm Organization** executes that stored preview; the frontend never supplies arbitrary move paths.

Files are grouped into `01_References`, `02_Design`, `03_Models`, `04_Textures`, `05_Video`, `06_Audio`, `07_Exports`, `08_Documents`, and `09_Others`. Image filenames containing any specified texture keyword are classified as textures, including the substring `ao`. Files already inside `07_Exports` retain the Exports category; other categories use the extension/texture rules. Unknown types, including developer source files, go to Other. Already organized files stay in place. Nested files are flattened into their category folder, with safe numbered suffixes for name conflicts.

Before moving, Rust verifies sources remain inside the project, rejects links and junctions, checks file size and modification time, and checks every target. Windows `MoveFileExW` is called without replacement flags, so a race that creates a destination cannot overwrite it. If a preview becomes stale, create a new preview. Errors are displayed clearly. A batch is not atomic: if a move fails partway through, earlier moves remain, the app reports the number completed, and those moves can be undone. Empty folders are preserved. There is no delete operation.

### Keep dependencies together

Before planning, AssetFlow reads only the manifest of every `.gltf` file and the JSON chunk of every `.glb` (never their binary data) and collects buffer and image URIs. Relative references, including percent-encoded names and `../` paths that stay inside the project, form a dependency group; models that share a resource join the same group. Each group moves as one folder, `03_Models/<first model name>/`, keeping every file's path relative to the group's deepest common folder, so all relative references still resolve. A numbered suffix is used if that folder already exists. The model files themselves are never rewritten.

A group stays in place, with the reason shown in the preview, when any of its models references a remote URL or absolute path, a file outside the project, a missing file, or a link/junction, or when its manifest cannot be read. Groups already inside `03_Models/` are left alone. Models with only embedded data are organized like any other file. Dependencies of other formats (Blender, After Effects, video editing projects, source code) are not detected.

### Undo organization

Before the first file moves, AssetFlow writes a journal of every planned move to `%LOCALAPPDATA%\com.assetflow.desktop\organization-journals\`; it is written to a temporary file, flushed to disk, and renamed into place. Each completed move then appends a line. If the app or PC stops mid-way, planned moves without a completion line are checked against the disk, so the journal still knows what actually moved. Only the most recent organization per project can be undone; if files from the previous one are still undoable, the Organization Preview warns before replacing that history.

**Undo Organization** (project header or command palette) opens a preview first. Each file is checked: it must still be at its organized location, inside the project, without links, with the same size and modification time, and its original location must be free. Files that fail a check are listed with the reason and are never overwritten or silently renamed: choose **Restore N, skip M** or Cancel. Skipped files stay undoable after you resolve the conflict. Each move is checked again immediately before it runs. Undo is not atomic either: if a move fails, earlier restores remain and the rest stay undoable. Category folders created during organization are kept.

Scanning reports unreadable paths and skips symbolic links, junctions, and other reparse points. Organization is blocked until scan warnings are resolved. Close other applications that are actively changing project files before organizing. Metadata validation is not a content hash, and a batch is not a filesystem transaction.

## File classification

| Category | Recognized formats / rule | Destination |
| --- | --- | --- |
| References / Images | PNG, JPG, JPEG, WEBP, TIFF, TIF, TGA, EXR, HDR, GIF, BMP, AVIF, SVG | `01_References` |
| Design | PSD, AI, FIG, XD | `02_Design` |
| Models | BLEND, GLB, GLTF, FBX, OBJ | `03_Models` |
| Textures | Images whose filename contains a texture keyword | `04_Textures` |
| Video | MP4, MOV, MKV, WEBM | `05_Video` |
| Audio | WAV, MP3, FLAC, AAC | `06_Audio` |
| Exports | Files already inside `07_Exports` | `07_Exports` |
| Documents | PDF, TXT, DOCX, MD, RTF | `08_Documents` |
| Other | Everything else, including developer source files | `09_Others` |

Extensions and filename matching are case-insensitive. Texture keywords: `normal`, `roughness`, `metallic`, `metalness`, `albedo`, `diffuse`, `height`, `displacement`, `ao`, `ambient_occlusion`, `specular`, and `opacity`. Matching uses substrings; `ao` can match unrelated names. Classification does not imply an editor or preview for every format.

```text
Before                         After
materials/wood_albedo.png  ->   04_Textures/wood_albedo.png
drafts/interface.fig       ->   02_Design/interface.fig
reference/photo.jpg        ->   01_References/photo.jpg
```

If the destination already exists, the plan reserves a safe name such as `wood_albedo_01.png`.

**Linked-project limitation:** only GLTF/GLB references are kept together. Moving Blender dependencies, video editing media, After Effects footage, or source-code imports can break references. Try organization on a backup or disposable project first; the last organization can be undone.

## Performance

`npm run bench` launches the release executable with an isolated WebView2 profile and disposable fixtures in `%TEMP%\assetflow-bench` (200, 5,000, and 50,000 files with 2048×2048 PNGs and a 131k-vertex textured GLB). It records process-tree working set and private bytes (all AssetFlow and WebView2 processes), CPU, GPU counters, scan/search/model-load time, frame gaps, and memory across ten inspector open/close cycles. Results are written to `test-results/perf-<label>.json`. Numbers depend on the PC; compare runs on the same machine. See [docs/PERFORMANCE.md](docs/PERFORMANCE.md) for the measured before/after results.

## Optional UI smoke checks

Playwright is supplied by the development environment, not installed as an app dependency. Install it locally with `npm install --no-save --package-lock=false playwright`, or point `ASSETFLOW_PLAYWRIGHT` to an existing package path. Browser mode uses installed Microsoft Edge. With `npm run dev` running, execute `node scripts/ui-smoke.cjs`.

For native checks, build first and launch an isolated test instance:

```powershell
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $env:TEMP ('AssetFlow-QA-' + [guid]::NewGuid())
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
Start-Process -FilePath '.\src-tauri\target\release\assetflow.exe' -WindowStyle Hidden
$env:ASSETFLOW_CDP = 'http://127.0.0.1:9223'
# Wait for the test window, then run sequentially.
node scripts/model-smoke.cjs
node scripts/ui-smoke.cjs
```

The scripts exercise fixture projects, including confirmed organization. Use an isolated test instance, not an active work session. Screenshots go to ignored `test-results/`. Clear the temporary WebView2 environment variables or use a new terminal before normal launches.

## Structure

- `src/components/`: sidebar, project header, statistics, search, grid/list/cards, preview, insights, empty state, and accessible native dialogs.
- `src/lib/filesystem.ts`: typed Tauri command boundary and native folder picker.
- `src/lib/thumbnails.ts`: bounded thumbnail cache, concurrency limit, and viewport-based loading.
- `src/components/AssetTools.tsx`: native Open With and opt-in technical metadata controls.
- `src/components/ContactSheet.tsx`, `src/lib/contactSheet.ts`: filtered asset selection and sequential export thumbnails.
- `src-tauri/src/asset_tools.rs`: project validation, native application chooser, bounded ffprobe, safe HTML generation and no-overwrite export.
- `src/components/MediaPreview.tsx`, `UndoPreview.tsx`: image/video/audio previews and the undo confirmation.
- `src/types.ts`: Asset, Project, AssetCategory, MoveOperation and supporting types.
- `src-tauri/src/filesystem.rs`: classification, recursive scanning, planning, path validation, no-overwrite moves, and safety tests.
- `src-tauri/src/lib.rs`: async commands, project session, and expiring organization/undo previews.
- `src-tauri/src/dependencies.rs`: GLTF/GLB manifest reading and dependency groups.
- `src-tauri/src/undo.rs`: persistent move journal, crash reconciliation, and undo validation.
- `scripts/perf-bench.cjs`: release-build performance benchmark.
- `src/components/ModelInspector.tsx`: interactive 3D viewport, studio setup, controls, and model details.
- `src/lib/model.ts`: project-scoped GLTF/GLB loading, decoder setup, metadata, centering, and resource disposal.
- `src-tauri/src/model.rs`: bounded read-only model/resource access and path-isolation tests.
- `scripts/copy-decoders.mjs`: prepares local decoder assets and a static Basis worker. The Basis worker has its own restrictive CSP allowing Emscripten's function constructors with no network access; the main UI continues to block `unsafe-eval`.

No authentication, cloud services, AI features, or database dependencies.

## Backlog

Planned work (duplicate detection, tags and virtual collections, rule presets, folder watcher, project health check, manifest export) is described in [docs/BACKLOG.md](docs/BACKLOG.md).

## Contributing and ownership

Bug reports should include the app version, Windows version, reproduction steps, and relevant errors. Share disposable samples rather than private project files. Before proposing code changes, run `npm run build` and `npm run test:rust`, plus relevant native checks for filesystem or viewer changes.

## License

AssetFlow is licensed under the [MIT License](LICENSE). Copyright © 2026 Jordy Lian Ferdinand (odyworks). You may use, modify, distribute, and sell copies, provided you retain the copyright and license notices. The software is provided without warranty. Third-party dependencies retain their respective licenses.
