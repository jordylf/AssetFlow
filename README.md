# AssetFlow

**Your creative work, in order.** A Windows desktop workspace for designers, 3D artists, video editors, and developers. Crafted **by odyworks**.

**English** · [Bahasa Indonesia](README.id.md)

Built with Tauri 2, Rust, React, TypeScript, Tailwind CSS, Lucide, Framer Motion, React Three Fiber, and Three.js. Everything runs locally, with a compact dark interface and keyboard-driven interactions. The application interface currently uses English; documentation is available in both languages.

![AssetFlow desktop workspace](docs/images/workspace.png)

## Features

| Feature | What it does |
| --- | --- |
| Project import | Open or drop a folder and recursively scan regular files without modifying them. |
| Asset browser | Grid/list views, thumbnails where supported, category filters, and sorting by name, size, or modification time. |
| Search | Find assets by filename, path, extension, or category. |
| Project statistics | Counts for images, textures, models, video, audio, design files, documents, and other files. |
| Storage Insights | Total size, category distribution by bytes, and the four largest assets. |
| Favorites and recents | Star assets and reopen project folders with locally stored preferences. |
| Organization preview | Review every proposed source/destination before confirming moves. |
| Conflict handling | Existing files are never overwritten; conflicts receive numbered suffixes. |
| 3D inspector | GLB/GLTF studio viewport, controls, geometry counts, materials, textures, and bounds. |
| Command palette | Ctrl+K opens six common actions with keyboard navigation. |

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
```

Installer output: `src-tauri/target/release/bundle/nsis/`. Standalone app: `src-tauri/target/release/assetflow.exe`.

`npm run dev` previews the interface in a browser; native folder operations require `npm run desktop` or the built executable.

## Use

Open a project folder or drop a folder into the app. Browse every regular file recursively, search names and paths, filter by category or file type, sort by name/size/modified time, and switch between grid and list views. Star files to save favorites. Recent paths, favorites, view preferences, and thumbnail settings are stored locally; file contents are never uploaded or indexed in a database.

Press **Ctrl+K** for the command palette: Open Project, Search Assets, Organize Project, Grid View, List View, and Open Settings. Type to filter, use Up/Down to navigate, Enter to run, and Escape to close and restore focus. Organize Project always opens the existing confirmation preview.

**Ctrl+O** opens a project; **/** focuses asset search when you're not typing in another field. From search, press Down to enter the file collection. Arrow keys navigate file cards and list rows; Enter inspects a file. Home/End jump to the first/last item. Sidebar navigation, category filters, and project statistics also support arrow keys. Escape clears an asset search or closes the active dialog. Dialogs keep keyboard focus inside while open, and restore it on close. Reduced-motion system preferences are respected.

Select an asset for its metadata and **Show in File Explorer**. Browser-supported raster images have thumbnails; other formats use type icons. Storage Insights shows project size, category shares by bytes, and the four largest files.

## 3D asset inspector

![AssetFlow 3D inspector with a sample GLB](docs/images/model-inspector.png)

Select a `.glb` or `.gltf` file in either view to open the inspector. The lazy-loaded React Three Fiber / Three.js viewport provides orbit controls, wheel and button zoom, automatic centering/framing, neutral studio lighting, grid and wireframe toggles, and camera reset. Drag to orbit, right-drag to pan, and scroll to zoom. Focus the viewport and press **R** to fit the model again; arrow keys pan. **Escape** closes the inspector and restores focus.

The details panel shows file name, size, format, modification date, vertex and triangle counts, materials, textures with image dimensions, and the source-space axis-aligned bounding box. Geometry totals count meshes in the default scene, including instances. The default scene is inspected in its static pose; source cameras and lights do not replace the studio setup. Preview centering, lighting, camera changes, and wireframe never alter the source model or its materials on disk.

Embedded GLB resources, embedded data URIs, and relative GLTF buffers/textures are supported. Resource paths may reference sibling folders inside the open project, including percent-encoded names. Rust validates every local resource against the project root and rejects escaping paths, junctions, and symbolic-link dependencies. Remote resource URLs and absolute references are rejected. Missing or invalid files produce an error with a retry action. Draco, Meshopt, and KTX2/Basis decoding runs locally with bundled decoders; no CDN is needed. The viewport renders on demand and disposes its model geometry, materials, textures, image bitmaps, and decoder workers when closed.

The lightweight inspector allows 512 MiB per local resource and 768 MiB of loaded source resources per model. WebGL hardware acceleration is required. GLTF resource paths must remain valid: the organizer moves files individually and does not rewrite model references. Keep dependent files together, or use a self-contained GLB when reorganizing.

## Organization and safety

**Organize Project** scans the current project again and creates a backend-owned preview. Cancel does not move anything. Only **Confirm Organization** executes that stored preview; the frontend never supplies arbitrary move paths.

Files are grouped into `01_References`, `02_Design`, `03_Models`, `04_Textures`, `05_Video`, `06_Audio`, `07_Exports`, `08_Documents`, and `09_Others`. Image filenames containing any specified texture keyword are classified as textures, including the substring `ao`. Files already inside `07_Exports` retain the Exports category; other categories use the extension/texture rules. Unknown types, including developer source files, go to Other. Already organized files stay in place. Nested files are flattened into their category folder, with safe numbered suffixes for name conflicts.

Before moving, Rust verifies sources remain inside the project, rejects links and junctions, checks file size and modification time, and checks every target. Windows `MoveFileExW` is called without replacement flags, so a race that creates a destination cannot overwrite it. If a preview becomes stale, create a new preview. Errors are displayed clearly. If a move fails partway through a batch, earlier moves remain and the app reports the number completed; rescan before retrying. Empty folders are preserved. There is no delete operation or automatic rollback.

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

**Linked-project limitation:** organization does not rewrite dependencies. Moving GLTF buffers/textures, Blender dependencies, video media, or source-code imports can break references. Try organization on a backup or disposable project first. There is no automatic undo; earlier successful moves remain if a batch fails partway through.

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
- `src/types.ts`: Asset, Project, AssetCategory, MoveOperation and supporting types.
- `src-tauri/src/filesystem.rs`: classification, recursive scanning, planning, path validation, no-overwrite moves, and safety tests.
- `src-tauri/src/lib.rs`: async commands, project session, and expiring organization previews.
- `src/components/ModelInspector.tsx`: interactive 3D viewport, studio setup, controls, and model details.
- `src/lib/model.ts`: project-scoped GLTF/GLB loading, decoder setup, metadata, centering, and resource disposal.
- `src-tauri/src/model.rs`: bounded read-only model/resource access and path-isolation tests.
- `scripts/copy-decoders.mjs`: prepares local decoder assets and a static Basis worker. The Basis worker has its own restrictive CSP allowing Emscripten's function constructors with no network access; the main UI continues to block `unsafe-eval`.

No authentication, cloud services, AI features, or database dependencies.

## Contributing and ownership

Bug reports should include the app version, Windows version, reproduction steps, and relevant errors. Share disposable samples rather than private project files. Before proposing code changes, run `npm run build` and `npm run test:rust`, plus relevant native checks for filesystem or viewer changes.

## License

AssetFlow is licensed under the [MIT License](LICENSE). Copyright © 2026 Jordy Lian Ferdinand (odyworks). You may use, modify, distribute, and sell copies, provided you retain the copyright and license notices. The software is provided without warranty. Third-party dependencies retain their respective licenses.
