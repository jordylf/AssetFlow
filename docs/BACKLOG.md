# AssetFlow backlog

Planned after the current features are stable. None of these are implemented yet. Every item keeps the existing rules: local only, no accounts, cloud, AI, or database, no deletion or overwrite of user files, and no file move without a preview and explicit confirmation.

| Item | Scope and approach | Done when |
| --- | --- | --- |
| Duplicate detection | Rust hashes candidate files with a streaming hasher in fixed-size chunks (never whole files in memory). Only files with equal sizes are hashed. Runs on a bounded worker pool, reports progress, and can be cancelled. Results list duplicate sets; any cleanup stays a manual, previewed action. | 50k-file fixture completes with flat memory, cancel stops within one chunk, and identical files with different names are grouped. |
| Tags and virtual collections | Tags and collections reference assets by project-relative path plus size/modification time, stored in a small JSON file in app data per project. Files never move. Renames by AssetFlow (organize/undo) update references. | Tags survive restart, organization, and undo; missing files are flagged, not dropped silently. |
| Organization rule presets | User-defined presets (folder names, category mapping, flatten vs. keep subfolders, texture keyword list with whole-word option to avoid the `ao` false positive). The backend still owns the plan; presets only change planning input. | Preview shows which preset produced each destination; the default preset reproduces today's behaviour exactly. |
| Asset manifest export | Export CSV and JSON with relative path, size, modification time, category, and an optional streaming hash. Written only to a location the user picks in a save dialog. | Export of a 50k-file project completes with flat memory; hash column is optional and cancellable. |

Also deferred from this round:

- Side-by-side comparison of two images (the single-image viewer is in place).
- Audio waveform display: needs decoding the whole file; only worth adding with a streaming, downsampled decoder.
- Grid virtualization: measured DOM size and scroll frame times were fine up to ~660 cards, so it was not needed yet. Revisit if "Show more" usage grows well beyond that.
- Scan progress and cancellation: a 50,000-file scan now takes about 0.3 s in Rust; add progress events if much larger projects show a measurable wait.

Delivered locally on 2026-10-29: live native folder notifications with batched full-project snapshots (per-folder incremental updates remain future work), Project Health Check for GLTF/GLB and scan/size warnings, and Collect & Package with streaming SHA-256 and preserved relative paths. See the README for scope and limitations. Standalone CSV/JSON manifest export remains distinct from the manifest already included in collected packages.
