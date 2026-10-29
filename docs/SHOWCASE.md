# AssetFlow visual sources / Sumber visual

The README uses original AssetFlow artwork and app captures. No artwork or screenshots were copied from another product. The editorial structure—cover, concise navigation, illustrated feature sections and linked operational detail—was informed by [NabyScape's README](https://github.com/BillyNabil/nabyscape), viewed on 2026-10-29.

README memakai artwork AssetFlow dan screenshot aplikasi. Artwork maupun screenshot produk lain tidak disalin. Susunan editorial mengambil referensi dari README NabyScape: cover, navigasi singkat, bagian fitur dengan visual, dan tautan panduan rinci.

| File | Source and context |
| --- | --- |
| `images/cover.svg` | Original vector brand artwork. Mint/charcoal palette, AssetFlow layer symbol, and illustrative asset tiles. This is a cover illustration, not a screenshot of application controls. Source remains editable. |
| `images/cover.png` | 1600 × 660 raster rendering of the SVG using installed Microsoft Edge; local fonts, no external image assets. |
| `images/workspace.png` | Native Windows release executable capture, 2026-10-29. Isolated WebView2 profile and a disposable project created by `scripts/create-sample.mjs`. Reference/texture SVGs are generated samples; PNG versions were rendered in Edge for the app's supported raster thumbnails. |
| `images/health-check.png` | Native health check of that disposable project. The no-issues result describes this fixture and the supported checks, not an assertion about every project. |
| `images/package-preview.png` | Native Collect & Package preview for the same fixture. Capture occurs before confirmation; the image does not represent a completed export. |
| `images/model-inspector.png` | Earlier actual AssetFlow inspector capture from the initial implementation, using a generated sample GLB. It illustrates the existing 3D viewer; it is not a newly recorded model scene. |

App screenshots contain sample content only. No client project, paid model library, or personal creative assets were used. The README does not claim ARM64 support, native ZIP/PDF export, or dependency analysis outside GLTF/GLB.

Screenshot aplikasi hanya menggunakan konten contoh. Tidak ada proyek klien, pustaka model berbayar, atau aset kreatif pribadi. README tidak mengklaim dukungan ARM64, ekspor ZIP/PDF native, atau analisis dependency di luar GLTF/GLB.

## Launch tour — 2026-10-29

`images/demo.gif` is the 6 fps, 960-pixel-wide preview of the silent 22-second MP4 published with release v1.0.0. Captured from the real release WebView in an isolated profile; only the application surface was recorded, with an explanatory caption band added below it. The disposable fixture uses generated architectural/form/texture images and the generated torus-knot GLB from native tests. Organization was explicitly confirmed on that fixture, and its complete content-hash multiset was verified unchanged. The footage does not depict any user/client project. The output MP4 is 24 fps with repeated capture frames; it is not a 24 fps performance benchmark.

`images/social-preview.png` is a 1280 × 640 share card composed from the original cover. It is ready for the repository social-preview setting; adding this file alone does not configure that GitHub setting.
