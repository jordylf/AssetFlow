# Performance measurements

Release build (`src-tauri/target/release/assetflow.exe`) before and after the October 2026 optimization round. Both columns were measured with the same harness (`scripts/perf-bench.cjs`), the same fixtures, and the same machine, one run each. Treat single-run differences under ~20% as noise.

**Machine:** Intel Core i7-13650HX (20 threads), 24 GB RAM, NVIDIA GeForce RTX 4060 Laptop GPU + Intel UHD Graphics, Windows 11, WebView2 156.0.4314.50.

## Method

- The executable is launched with a fresh WebView2 profile and a CDP port; Playwright drives it. Projects are opened through the same drop event the UI uses.
- **Memory** is summed over the whole process tree (AssetFlow plus every WebView2 process, 7 processes): *working set* = `WorkingSetSize`, *private* = `PrivatePageCount` (private bytes), both from `Win32_Process`.
- **CPU %** is process-tree kernel+user time divided by wall time and by all 20 logical processors (so 5% ≈ one full core).
- **GPU** dedicated memory and engine utilization come from the Windows `GPU Process Memory` / `GPU Engine` counters for the tree's PIDs.
- **Fixtures** (`%TEMP%\assetflow-bench`, created once, never modified): small = 200 files / 40 PNG; medium = 5,000 files / 400 PNG / 50 folders; large = 50,000 files / 2,000 PNG / 500 folders. PNGs are 2048×2048 RGB; every fixture also has a 131,841-vertex, 262,144-triangle GLB with an embedded 2048×2048 texture.
- Fixtures run in one app session in order small → medium → large, so later rows include memory carried over from earlier ones. "After browse" = clicking *Show more* up to ten times, scrolling through all cards, then 3 s of settling.
- *Scan* = drop event until the library footer renders. *Scan invoke* = the `scan_project` command alone (Rust + IPC). *Search* = average time from an input event to two animation frames later over five queries. *Max frame* = longest gap between animation frames during the operation.

## Results

| Metric | Baseline | After | Change |
| --- | ---: | ---: | --- |
| Startup to first screen | 1,537 ms | 1,164 ms | similar (noise) |
| Idle, no project: working set / private | 409 / 253 MB | 406 / 252 MB | unchanged |
| Idle, no project: CPU | 0.29% | 0.69% | both < 0.2 core |
| **Large (50k): scan to ready** | 4,012 ms | 859 ms | −79% |
| Large: longest frame during scan | 1,750 ms | 161 ms | −91% (no visible freeze) |
| Large: scan command (Rust + IPC) | 1,936 ms | 313 ms | −84% |
| Large: scan payload | 12.8 MB | 7.8 MB | −39% |
| **Large: search per keystroke** | 673 ms | 42 ms | −94% |
| Large: after scan, working set / private | 657 / 514 MB | 617 / 469 MB | −9% private |
| Large: after browse, working set / private | 1,122 / 1,041 MB | 1,045 / 766 MB | −26% private |
| Large: after browse, GPU dedicated | 275 MB | 82 MB | −70% |
| Large: idle CPU after scan | 1.15% | 0.25% | lower |
| Medium (5k): scan to ready | 508 ms | 134 ms | −74% |
| Medium: search per keystroke | 92 ms | 49 ms | −47% |
| Medium: after browse, working set / private | 933 / 648 MB | 1,321 / 665 MB | private unchanged; working set higher (see below) |
| Small (200): after browse, working set / private | 953 / 971 MB | 1,174 / 525 MB | −46% private |
| Small: after browse, GPU dedicated | 390 MB | 109 MB | −72% |
| Scrolling, longest frame (all fixtures) | 6–39 ms | 6–17 ms | no long frames before or after |
| 3D inspector: first open (incl. lazy chunk) | 1,025 ms | 1,320 ms | single sample, unchanged code path |
| 3D inspector: median open, opens 2–10 | 252 ms | 252 ms | unchanged |
| 3D inspector open: private / GPU dedicated | 944 / 288 MB | 702 / 266 MB | lower baseline before opening |
| After 10 open/close cycles, settled private / working set | 615 / 745 MB | 564 / 693 MB | no growth after GC |

**Working set vs. private bytes.** Generating thumbnails decodes each full-size image once and keeps only a small WebP copy. Right after a burst of decoding, Chromium's discardable image cache inflates the *working set* (shared, reclaimable pages) for a few seconds; *private bytes*, which count committed memory that cannot be reclaimed, drop. A separate probe that scrolled the small fixture slowly and sampled after 6 s measured the same working set as the baseline (≈452 vs 458 MB) with lower private bytes (283 vs 348 MB; GPU process 135 vs 197 MB). No universal RAM ceiling is claimed: WebView2 alone uses ~250 MB private at idle on this machine.

**Inspector lifecycle.** Memory rises during rapid open/close cycles and returns after garbage collection (settled value lower than after the first close in both builds), so no leak was found. The inspector disposes geometry, materials, textures, ImageBitmaps, object URLs, and decoder workers when it closes, and React Three Fiber disposes its WebGL renderer on unmount; rendering is on demand and stops when nothing changes. These paths were not changed in this round.

## What changed and why

| Bottleneck (measured) | Change |
| --- | --- |
| 2048² thumbnails decoded at full size in every card: +590 MB private and +390 MB GPU after browsing 40 images | Thumbnails are decoded once, resized to card size (≤480×282 cover), re-encoded as WebP, cached in a 32 MB LRU by encoded bytes, generated three at a time, and only attached while a card is within 600 px of the viewport. |
| Search: per keystroke, every asset built a new lowercase string and the list was re-sorted with `localeCompare(…, {numeric})`, which creates a collator per comparison | Sorting and the lowercase search text are computed once per project/sort change with one `Intl.Collator`; each keystroke is a single filter pass. Statistics, favorites lookups, and Storage Insights are memoized. |
| Scan: an extra metadata syscall per file and an absolute path duplicated in the IPC payload | Rust reuses the directory listing's metadata (`DirEntry::metadata`, which also does not follow links) and omits the absolute path; the frontend rebuilds it from the project path. |

Grid virtualization, a scan progress/cancel API, and GPU-acceleration changes were not made: the measurements did not show them as bottlenecks.
