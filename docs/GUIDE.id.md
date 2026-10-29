# AssetFlow — Panduan pengguna & developer

**Karya kreatifmu, lebih tertata.** Aplikasi desktop Windows untuk menjelajahi, memeriksa, dan merapikan file proyek desainer, seniman 3D, editor video, serta developer. Dibuat **by odyworks**.

[English](GUIDE.md) · **Bahasa Indonesia**

Dibangun dengan Tauri 2, Rust, React, TypeScript, Tailwind CSS, Lucide, Framer Motion, React Three Fiber, dan Three.js. Seluruh pengelolaan aset berjalan lokal melalui antarmuka gelap yang ringkas dan mendukung navigasi keyboard. Antarmuka aplikasi saat ini menggunakan bahasa Inggris; dokumentasi tersedia dalam dua bahasa.

![Area kerja desktop AssetFlow](images/workspace.png)

## Fitur utama

| Fitur | Kegunaan |
| --- | --- |
| Pembaruan folder otomatis | Notifikasi native, snapshot baca-saja, pause/resume, dan rescan manual. |
| Project Health Check | Periksa resource GLTF/GLB, peringatan scan, file kosong dan aset besar. |
| Collect & Package | Salinan dengan preview, dependency model, path relatif dan manifest SHA-256. |
| Open With | Pilih aplikasi Windows dari detail atau inspector aset. |
| Metadata teknis | Pembacaan metadata sesuai permintaan dengan ffprobe opsional. |
| Contact sheet | Katalog HTML mandiri dengan thumbnail, hingga 200 aset. |
| Impor proyek | Buka atau seret folder ke aplikasi desktop; pindai file secara rekursif tanpa mengubahnya. |
| Browser aset | Tampilan grid/daftar, thumbnail kecil yang di-cache, filter kategori, serta pengurutan nama, ukuran, dan tanggal perubahan. |
| Pencarian | Cari berdasarkan nama file, path, ekstensi, atau kategori. |
| Statistik proyek | Jumlah gambar, tekstur, model, video, audio, file desain, dokumen, serta file lain. |
| Storage Insights | Ukuran total proyek, distribusi kategori berdasarkan byte, dan empat aset terbesar. |
| Favorit dan proyek terbaru | Tandai aset dan buka kembali proyek dengan preferensi yang disimpan lokal. |
| Pratinjau organisasi | Periksa lokasi asal dan tujuan seluruh file sebelum menyetujui pemindahan. |
| Dependensi tetap bersama | Model GLTF/GLB dipindahkan sebagai satu folder bersama buffer dan tekstur lokal yang dirujuknya, termasuk resource yang dipakai beberapa model. |
| Undo organisasi | Kembalikan organisasi terakhir setelah meninjau pratinjau; jurnal pemindahan tetap ada setelah aplikasi dibuka ulang. |
| Penanganan nama bentrok | File tidak ditimpa; nama bentrok mendapat akhiran angka. |
| Preview gambar | Zoom, pan, fit/100%, dimensi piksel, dan latar papan catur untuk transparansi. |
| Preview video/audio | Pemutaran lokal dengan seek dan volume, durasi, resolusi video, serta pesan jelas untuk codec yang tidak didukung. |
| Inspector 3D | Viewport GLB/GLTF dengan pencahayaan studio, kontrol kamera, dan metadata. |
| Command palette | Ctrl+K untuk membuka tindakan proyek dan tampilan melalui keyboard. |

Tidak ada autentikasi, sinkronisasi cloud, fitur AI, atau database. Isi file tetap berada di perangkatmu. Internet diperlukan untuk mengunduh dependensi pengembangan; penelusuran, inspeksi, dan organisasi aset berjalan lokal.

## Instalasi Windows

Target build saat ini adalah Windows x64. Jika paket aplikasi sudah diterbitkan, unduh melalui [GitHub Releases](https://github.com/jordylf/AssetFlow/releases):

- `AssetFlow_1.0.0_x64-setup.exe`: instal untuk pengguna Windows saat ini.
- `AssetFlow.exe`: jalankan aplikasi standalone secara langsung.

Diperlukan Microsoft Edge WebView2 Runtime. Inspector 3D juga membutuhkan akselerasi perangkat keras WebGL. Jika belum ada release, gunakan panduan build dari source di bawah. Hasil kompilasi diabaikan Git; salinan paket lokal dapat disimpan di `release/`.

## Menjalankan dari source

Persyaratan pengembangan:

- Node.js 20.19+ atau 22.12+ dan npm untuk Vite 7.
- Rust stable dengan toolchain MSVC.
- Microsoft Visual Studio C++ Build Tools dan Windows SDK.
- WebView2 Runtime pada Windows x64.

```powershell
git clone https://github.com/jordylf/AssetFlow.git
cd AssetFlow
npm ci
npm run desktop
```

Launcher juga mencari Rust di direktori `.cargo/bin` default pengguna. Aset decoder disiapkan otomatis sebelum pengembangan frontend dan build.

| Perintah | Kegunaan |
| --- | --- |
| `npm run desktop` | Jalankan aplikasi native dalam mode pengembangan |
| `npm run dev` | Preview antarmuka di browser pada `http://127.0.0.1:1420` |
| `npm run build` | Pemeriksaan TypeScript dan build frontend produksi |
| `npm run test:rust` | Tes klasifikasi, keamanan filesystem, dan isolasi resource model |
| `npm run desktop:build` | Build executable native dan installer NSIS |
| `npm run sample` | Buat proyek contoh baru di direktori sementara sistem |
| `npm run bench` | Ukur build release dengan fixture sementara (memerlukan Playwright) |

Operasi folder native membutuhkan aplikasi desktop; preview browser hanya menyediakan antarmuka.

Hasil build:

```text
src-tauri/target/release/assetflow.exe
src-tauri/target/release/bundle/nsis/AssetFlow_1.0.0_x64-setup.exe
```

## Cara menggunakan

1. Jalankan aplikasi, lalu klik **Open Project Folder** atau seret folder ke jendela AssetFlow.
2. Tunggu pemindaian selesai. Periksa peringatan jika ada file atau folder yang tidak bisa dibaca.
3. Cari aset berdasarkan nama/path, filter kategori atau tipe file, lalu urutkan berdasarkan nama, ukuran, atau waktu perubahan.
4. Pilih **Grid View** untuk penelusuran visual atau **List View** untuk tampilan daftar.
5. Pilih aset untuk melihat metadata. File GLB/GLTF membuka inspector 3D; gambar, video, dan audio membuka preview; aset lain membuka detail file.
6. Tandai bintang untuk favorit atau gunakan **Show in File Explorer** untuk menemukan file asal.
7. Klik **Organize Project** untuk membuat pratinjau. **Cancel** tidak memindahkan file; **Confirm Organization** menjalankan rencana.
8. Klik **Undo Organization** untuk meninjau dan mengembalikan organisasi terakhir.

Path proyek terbaru, favorit, preferensi tampilan, dan pengaturan thumbnail disimpan dalam penyimpanan lokal WebView. Gambar raster yang didukung browser memiliki thumbnail; format lainnya memakai ikon. Thumbnail di-decode sekali, diperkecil ke ukuran kartu, disimpan dalam cache memori 32 MB, dibuat paling banyak tiga sekaligus, dan hanya dimuat untuk kartu di dekat area terlihat. Storage Insights menampilkan ukuran total, distribusi kategori berdasarkan byte, serta empat file terbesar.

## Klasifikasi file

| Kategori | Format / aturan | Folder tujuan |
| --- | --- | --- |
| References / Images | PNG, JPG, JPEG, WEBP, TIFF, TIF, TGA, EXR, HDR, GIF, BMP, AVIF, SVG | `01_References` |
| Design | PSD, AI, FIG, XD | `02_Design` |
| Models | BLEND, GLB, GLTF, FBX, OBJ | `03_Models` |
| Textures | Gambar dengan nama yang mengandung kata kunci tekstur | `04_Textures` |
| Video | MP4, MOV, MKV, WEBM | `05_Video` |
| Audio | WAV, MP3, FLAC, AAC | `06_Audio` |
| Exports | File yang sudah berada dalam `07_Exports` | `07_Exports` |
| Documents | PDF, TXT, DOCX, MD, RTF | `08_Documents` |
| Other | Format lainnya, termasuk source code developer | `09_Others` |

Ekstensi dan nama dicocokkan tanpa membedakan huruf besar/kecil. Kata kunci tekstur: `normal`, `roughness`, `metallic`, `metalness`, `albedo`, `diffuse`, `height`, `displacement`, `ao`, `ambient_occlusion`, `specular`, dan `opacity`. Pencocokan memakai substring, sehingga kata pendek `ao` bisa cocok dengan nama yang sebenarnya tidak berkaitan dengan tekstur. File yang sudah berada dalam `07_Exports` tetap masuk Exports.

Klasifikasi tidak berarti semua format memiliki editor atau preview bawaan. Preview 3D interaktif saat ini hanya mendukung GLB dan GLTF.

## Preview gambar, video, dan audio

PNG, JPG, WEBP, GIF, AVIF, BMP, dan SVG dibuka di penampil gambar: scroll atau **+**/**−** untuk zoom di posisi kursor, drag atau tombol panah untuk pan, **0** atau klik ganda untuk fit, **1** untuk ukuran asli. Panel menampilkan dimensi piksel dan zoom; area transparan tampil di atas latar papan catur. Gambar resolusi penuh dilepas saat penampil ditutup.

Video MP4, MOV, WEBM, MKV serta audio WAV, MP3, FLAC, AAC diputar lokal dengan kontrol bawaan (putar, seek, volume). Hanya metadata yang dimuat terlebih dahulu (`preload="metadata"`) untuk durasi dan resolusi; pemutaran dihentikan dan decoder dilepas saat preview ditutup. Dukungan pemutaran bergantung pada codec WebView2 di PC tersebut: codec atau container yang tidak didukung (sering MKV atau sebagian codec MOV profesional) menampilkan pesan jelas. Waveform audio tidak digambar agar tidak perlu mendecode seluruh file.

## Organisasi dan keamanan file

**Organize Project tidak langsung memindahkan file.** Backend memindai ulang proyek dan menyimpan rencana pemindahan. Tombol konfirmasi mengirim ID rencana ke Rust, bukan path bebas dari antarmuka.

```text
Sebelum                        Sesudah
materials/wood_albedo.png  ->   04_Textures/wood_albedo.png
drafts/interface.fig       ->   02_Design/interface.fig
reference/photo.jpg        ->   01_References/photo.jpg
```

File dalam subfolder diratakan ke folder kategorinya. Jika nama tujuan sudah ada, dibuat nama aman seperti `wood_albedo_01.png`. File yang sudah terorganisasi tetap di tempatnya. Folder kosong tidak dihapus.

Perlindungan yang diterapkan:

- Pemindaian hanya membaca file dan melewati symbolic link, junction, serta reparse point lain.
- Peringatan pemindaian perlu diselesaikan sebelum organisasi dijalankan.
- Rust memvalidasi batas proyek, ukuran/waktu perubahan file asal, serta tujuan sebelum memindahkan.
- Windows memakai `MoveFileExW` tanpa opsi penggantian, sehingga file tujuan tidak tertimpa meskipun muncul setelah pratinjau dibuat.
- Tidak tersedia operasi penghapusan file.
- Pratinjau yang sudah tidak sesuai harus dibuat ulang. Kesalahan ditampilkan kepada pengguna.

### Dependensi GLTF tetap bersama

Sebelum membuat rencana, AssetFlow hanya membaca manifest setiap `.gltf` dan chunk JSON setiap `.glb` (tidak pernah data binernya), lalu mengumpulkan URI buffer dan gambar. Referensi relatif, termasuk nama ber-percent-encoding dan path `../` yang tetap di dalam proyek, membentuk satu grup dependensi; model yang memakai resource yang sama masuk grup yang sama. Setiap grup dipindahkan sebagai satu folder `03_Models/<nama model pertama>/` dengan path relatif terhadap folder bersama terdalam, sehingga semua referensi relatif tetap valid. Akhiran angka dipakai jika folder sudah ada. Isi file model tidak pernah ditulis ulang.

Grup tetap di tempat, dengan alasan ditampilkan di pratinjau, jika salah satu modelnya merujuk URL jarak jauh atau path absolut, file di luar proyek, file yang hilang, link/junction, atau manifest-nya tidak dapat dibaca. Grup yang sudah berada di `03_Models/` dibiarkan. Model yang seluruh datanya tertanam diorganisasi seperti file biasa. Dependensi format lain (Blender, After Effects, proyek editing video, source code) tidak dideteksi.

### Undo organisasi

Sebelum file pertama dipindahkan, AssetFlow menulis jurnal seluruh rencana pemindahan ke `%LOCALAPPDATA%\com.assetflow.desktop\organization-journals\`: ditulis ke file sementara, di-flush ke disk, lalu di-rename ke tempatnya. Setiap pemindahan yang berhasil menambahkan satu baris. Jika aplikasi atau PC berhenti di tengah proses, rencana tanpa baris selesai dicocokkan dengan kondisi disk sehingga jurnal tetap tahu file mana yang benar-benar pindah. Hanya organisasi terakhir per proyek yang dapat di-undo; jika masih ada file dari organisasi sebelumnya yang dapat di-undo, Organization Preview memberi peringatan sebelum riwayat itu diganti.

**Undo Organization** (header proyek atau command palette) selalu membuka pratinjau. Setiap file diperiksa: masih berada di lokasi hasil organisasi, di dalam proyek, tanpa link, ukuran dan waktu perubahan sama, dan lokasi asalnya kosong. File yang gagal diperiksa ditampilkan beserta alasannya dan tidak pernah ditimpa atau di-rename diam-diam: pilih **Restore N, skip M** atau Cancel. File yang dilewati tetap dapat di-undo setelah konflik diselesaikan. Setiap pemindahan diperiksa ulang tepat sebelum dijalankan.

**Batasan proyek yang saling terhubung:** hanya referensi GLTF/GLB yang dijaga tetap bersama. Memindahkan dependensi Blender, media proyek video, footage After Effects, maupun file yang diimpor source code dapat memutus referensi. Coba organisasi pada cadangan atau proyek contoh terlebih dahulu; organisasi terakhir dapat di-undo.

Satu batch organisasi maupun undo bukan transaksi filesystem. Jika pemindahan gagal di tengah proses, file yang sebelumnya berhasil dipindahkan tetap di lokasi baru; aplikasi melaporkan jumlah keberhasilan dan kesalahan, dan sisanya tetap dapat di-undo. Folder kategori yang dibuat saat organisasi tidak dihapus. Validasi metadata bukan pemeriksaan hash isi file. Tutup aplikasi yang sedang aktif mengubah file sebelum mengonfirmasi organisasi.

## Pembaruan folder otomatis

Proyek aktif dipantau melalui notifikasi filesystem native (`ReadDirectoryChangesW` pada Windows melalui notify), bukan pemindaian polling berkala. Penambahan, penyimpanan, rename, penghapusan, dan perubahan subfolder digabung setelah sekitar 450 ms tanpa perubahan baru, atau dua detik saat event terus beruntun. Snapshot proyek di latar memperbarui daftar, statistik dan thumbnail tanpa mereset pencarian, kategori, tampilan, urutan atau jumlah kartu yang sudah dimuat. Snapshot saat ini memindai ulang proyek; indeks inkremental per folder belum tersedia.

Klik **Live folder** untuk pause/resume, atau ubah **Live folder updates** di Settings. Rescan manual tetap tersedia. Pembaruan menunggu selama inspector, command palette, preview organisasi/undo, contact sheet, health check atau packaging terbuka, lalu menerapkan perubahan tertunda. File tidak pernah diorganisasi otomatis. Thumbnail memakai versi URL serta ukuran/waktu perubahan agar gambar yang disimpan ulang dimuat kembali.

Mengganti proyek mengganti watcher. Tombol **Close project** di samping path, atau perintah **Close Project** pada Ctrl+K, melepas proyek dan watcher. Error menyediakan retry; filesystem tertentu mungkin membutuhkan rescan manual. Jika folder proyek dipindah/dihapus dari luar aplikasi, buka ulang lokasi yang benar. Favorit masih berdasarkan path sehingga rename eksternal tidak otomatis memindahkan tanda favorit. Pause live updates saat build besar terus mengubah banyak file jika snapshot berulang tidak diperlukan.

## Project Health Check

Klik **Health check** atau perintah **Project Health Check** pada Ctrl+K. Pemeriksaan hanya membaca proyek dan manifest GLTF/GLB: resource hilang, referensi remote/absolut/keluar proyek, link tidak aman, manifest tidak terbaca atau JSON tidak valid. Peringatan scan, file kosong, dan aset berukuran 512 MiB ke atas juga dilaporkan. Seluruh temuan dihitung; maksimal 1.000 ditampilkan.

Laporan menyebut model yang merujuk dan setiap masalah resource, bukan hanya kesalahan pertama. Perbaiki sumber melalui aplikasi aslinya, lalu klik **Run again**. File besar/kosong merupakan peringatan untuk diperiksa, bukan vonis rusak. Ini pemeriksaan dependency/metadata, bukan validator semantik glTF lengkap, tes rendering, pemindai malware, atau validator proyek Blender/Adobe/editor video.

## Collect & Package

Klik **Collect & package** atau perintah yang sama melalui Ctrl+K. Pilihan mengikuti filter/urutan browser: maksimal 5.000 kandidat, dengan 60 pilihan awal dan daftar bertahap. **Review package** mencari dependency GLTF/GLB dan menampilkan seluruh salinan, dependency tambahan, ukuran total dan batasan. Resource bersama hanya disalin sekali. Dependency model yang hilang/tidak aman memblokir konfirmasi sampai diperbaiki.

Pengumpulan hanya dimulai melalui **Confirm & choose destination**, lalu pemilih folder native. Pilih tujuan di luar proyek sumber. Aplikasi membuat folder baru `AssetFlow-package-<timestamp>`; sumber tidak dipindahkan, diganti nama, ditimpa atau dihapus. Path relatif dipertahankan di bawah `assets/`, sehingga referensi GLTF relatif yang didukung tetap utuh tanpa menulis ulang model. Memilih tekstur saja tidak otomatis mengumpulkan semua model yang memakainya. Dependency format lain tidak dianalisis.

Penyalinan berlangsung streaming memakai buffer 128 KiB sambil menghitung SHA-256, bukan memuat seluruh file ke RAM. Progres menampilkan byte dan jumlah file. Metadata sumber diperiksa sebelum menyalin, setelah setiap file dan sebelum finalisasi. Pemeriksaan ukuran/waktu ini bukan transaksi filesystem dan tidak menjamin perlindungan dari semua perubahan eksternal bersamaan. Hash isi salinan dicantumkan dalam `manifest.json` untuk verifikasi penerima.

Hasil berisi `assets/`, `README.txt`, `PACKAGE_STATUS.txt`, serta—hanya jika berhasil—`manifest.json` yang dipublikasikan secara atomik dengan `complete: true`. Catatan status tetap ada dan menjelaskan bahwa manifest lengkap yang valid adalah penanda keberhasilan. Pembatalan/kegagalan meninggalkan hasil parsial tanpa manifest lengkap untuk diperiksa; jangan bagikan sebagai paket selesai, kumpulkan ulang ke folder baru. **Cancel collection** berhenti pada chunk baca/tulis berikutnya; panggilan I/O OS/jaringan yang tersendat dapat lebih lama. Pemilih tujuan native memiliki tombol Cancel sendiri. Hasil parsial tidak dihapus otomatis.

Output merupakan folder, bukan arsip ZIP. Batas preview 10.000 file termasuk dependency. **Open package folder** membuka hasil lengkap atau parsial. Analisis dependency hanya mencakup buffer dan gambar GLTF/GLB; proyek Blender, Adobe, editor video dan source code tetap perlu diperiksa.

## Open With dan metadata teknis

Tombol **Open with…** pada detail aset dan inspector membuka pemilih aplikasi Windows. Hanya file biasa dalam proyek aktif yang diterima; symbolic link, path keluar proyek, file executable, dan shortcut ditolak. Membatalkan dialog tidak mengubah aset. Aplikasi eksternal dapat mengubah file sesuai tindakan yang kamu lakukan di sana.

Preview gambar dan media menyediakan **Read technical metadata**. Fitur ini memakai `ffprobe.exe` dari direktori absolut dalam PATH proses. FFmpeg bersifat opsional dan tidak disertakan dalam installer. Setelah memasang FFmpeg, jalankan ulang AssetFlow agar PATH diperbarui. Preview dasar, detail file, dan contact sheet tetap berfungsi tanpa ffprobe.

Properti yang dilaporkan mencakup container, codec/profile, dimensi encoded, frame rate, bitrate, format piksel, bit depth/properti warna, codec audio, sample rate, channel layout, serta sample format. Field yang tidak tersedia tidak ditebak. Ekstraksi EXIF dan profil ICC belum termasuk. Rasio gambar ditampilkan bersama dimensi yang sudah ada. Frame rate berasal dari metadata stream, bukan analisis seluruh frame.

Pembacaan hanya berjalan saat diminta, maksimal satu proses dengan satu thread decoder, batas alokasi individual FFmpeg 64 MiB, output 256 KiB, dan timeout delapan detik. Ini bukan batas total RAM proses. Protokol jaringan dan demuxer playlist dinonaktifkan. Menutup preview mengabaikan hasil yang terlambat; probe yang aktif selesai atau dihentikan saat timeout. File rusak, ffprobe yang tidak tersedia, dan timeout menampilkan pesan jelas.

## Contact sheet

Klik **Contact sheet** di atas browser aset atau **Create Contact Sheet** melalui Ctrl+K. Dialog mengikuti pencarian, filter, dan urutan saat ini. Maksimal 200 hasil pertama ditampilkan dengan 60 pilihan awal. Pilih file satu per satu, judul, 2–4 kolom, serta opsi thumbnail. Persempit filter untuk memilih kumpulan lainnya.

Ekspor membuat file `.html` baru melalui dialog Save Windows. File yang sudah ada tidak ditimpa, termasuk setelah dialog overwrite dari sistem; pilih nama baru jika bentrok. Katalog mandiri berisi nama yang di-escape, path relatif proyek, ekstensi, ukuran byte, kredit `by odyworks`, serta thumbnail WebP tertanam. Tidak ada file sumber, script, permintaan jaringan, atau path absolut proyek dalam hasilnya. Periksa nama dan path relatif sebelum membagikannya.

Thumbnail raster disiapkan satu per satu, maksimal 360×240 piksel. Gambar yang tidak didukung/tidak terbaca, sumber di atas 24 MiB, dan thumbnail yang melewati enam detik memakai label format. Model/video/audio juga memakai label; ekspor tidak merender seluruh model atau mendecode video. Persiapan dapat dibatalkan sebelum dialog Save; batalkan dialog native untuk menghentikan penyimpanan. Batas ekspor 200 aset dan 12 MiB teks thumbnail. Gambar terkompresi kecil masih dapat memerlukan decode sementara yang lebih besar di WebView2.

Setelah disimpan, klik **Open in browser / print**, lalu gunakan Print (Ctrl+P) di browser untuk mencetak atau Save as PDF. AssetFlow mengekspor HTML; PDF dibuat melalui sistem cetak browser. Ekspor tidak memindahkan atau mengubah file sumber.

## Inspector aset 3D

![Inspector 3D AssetFlow dengan contoh GLB](images/model-inspector.png)

Pilih file `.glb` atau `.gltf` untuk membuka inspector React Three Fiber / Three.js yang dimuat saat diperlukan.

- Orbit melalui drag, pan melalui klik kanan dan drag, serta zoom melalui scroll atau tombol.
- Model otomatis dipusatkan dan dibingkai dengan pencahayaan studio netral.
- Tombol grid, wireframe, serta reset kamera.
- Nama file, ukuran, format, tanggal perubahan, dan path asal.
- Jumlah vertex dan triangle, material, tekstur beserta dimensi gambar, serta minimum/maksimum/dimensi bounding box.

Jumlah geometri berasal dari mesh pada scene default, termasuk instance. Model ditampilkan dalam pose statis; kamera dan lampu sumber tidak menggantikan studio. Bounding box menggunakan koordinat asal model, terpisah dari preview yang dipusatkan. Perubahan kamera, pencahayaan, dan wireframe tidak menulis perubahan ke model atau material di disk.

Resource tertanam dalam GLB, data URI, dan buffer/tekstur GLTF dengan path relatif didukung. Path dapat mengarah ke folder saudara selama masih di dalam proyek, termasuk nama dengan percent encoding. Rust memvalidasi semua resource terhadap folder proyek dan menolak path keluar proyek, junction, symbolic link, URL jarak jauh, serta referensi absolut.

Decoder Draco, Meshopt, dan KTX2/Basis disertakan secara lokal tanpa CDN. Resource hilang atau tidak valid menampilkan kesalahan dengan opsi mencoba ulang. Viewport merender sesuai kebutuhan dan melepaskan geometri, material, tekstur, image bitmap, serta worker decoder saat ditutup.

Batasnya 512 MiB per resource lokal dan total 768 MiB resource sumber yang dimuat per model. Ini merupakan viewer; pengeditan model, kontrol pemutaran animasi, dan preview interaktif BLEND/FBX/OBJ belum tersedia.

## Shortcut keyboard

| Shortcut | Tindakan |
| --- | --- |
| Ctrl+K | Buka command palette |
| Ctrl+O | Buka folder proyek |
| `/` | Fokus pencarian ketika tidak mengetik di kolom lain |
| Atas / Bawah dalam palette | Navigasi perintah yang cocok |
| Enter | Jalankan perintah atau periksa aset yang difokuskan |
| Tombol panah | Navigasi kartu/baris aset, sidebar, kategori, dan statistik yang didukung |
| Home / End | Fokus aset pertama / terakhir |
| Bawah dari pencarian | Masuk ke kumpulan aset |
| Escape | Tutup dialog aktif atau hapus pencarian aset |
| R saat viewport 3D fokus | Bingkai ulang/reset kamera |
| Tombol panah saat viewport 3D fokus | Geser kamera |
| + / − / 0 / 1 di penampil gambar | Zoom masuk / keluar / fit / ukuran asli |

Perintah palette: **Open Project**, **Search Assets**, **Organize Project**, **Undo Last Organization**, **Create Contact Sheet**, **Project Health Check**, **Collect & Package**, **Close Project**, **Grid View**, **List View**, dan **Open Settings**. Organize Project tetap membuka pratinjau konfirmasi. Fokus keyboard ditahan dalam dialog saat terbuka dan dipulihkan setelah ditutup. Preferensi sistem untuk mengurangi animasi dihormati.

## Performa

`npm run bench` menjalankan executable release dengan profil WebView2 terpisah dan fixture sementara di `%TEMP%\assetflow-bench` (200, 5.000, dan 50.000 file dengan PNG 2048×2048 serta GLB bertekstur 131 ribu vertex). Yang dicatat: working set dan private bytes seluruh process tree (AssetFlow dan WebView2), CPU, counter GPU, waktu scan/pencarian/pemuatan model, jeda frame, serta memori selama sepuluh siklus buka/tutup inspector. Hasil disimpan di `test-results/perf-<label>.json`. Angka bergantung pada PC; bandingkan hasil di mesin yang sama. Hasil sebelum/sesudah ada di [docs/PERFORMANCE.md](PERFORMANCE.md).

## Pemeriksaan UI opsional

Playwright disediakan oleh lingkungan pengembangan, bukan dependensi aplikasi. Instal dengan `npm install --no-save --package-lock=false playwright`, atau arahkan `ASSETFLOW_PLAYWRIGHT` ke path paket yang sudah tersedia. Mode browser memakai Microsoft Edge. Saat `npm run dev` berjalan, jalankan `node scripts/ui-smoke.cjs`.

Untuk pemeriksaan native, build terlebih dahulu dan gunakan instance pengujian terpisah:

```powershell
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $env:TEMP ('AssetFlow-QA-' + [guid]::NewGuid())
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
Start-Process -FilePath '.\src-tauri\target\release\assetflow.exe' -WindowStyle Hidden
$env:ASSETFLOW_CDP = 'http://127.0.0.1:9223'
# Tunggu jendela pengujian siap, lalu jalankan berurutan.
node scripts/model-smoke.cjs
node scripts/ui-smoke.cjs
```

Script menggunakan proyek fixture, termasuk organisasi yang dikonfirmasi. Gunakan instance terpisah, bukan sesi kerja aktif. Screenshot disimpan dalam `test-results/` yang diabaikan Git. Hapus variabel WebView2 sementara atau gunakan terminal baru untuk menjalankan aplikasi secara normal.

## Arsitektur

- `src/App.tsx`: state proyek, filter, favorit, preferensi, dan interaksi aplikasi.
- `src/components/`: Sidebar, ProjectHeader, StatCard, AssetGrid, AssetList, AssetCard, SearchBar, OrganizationPreview, StorageInsights, EmptyState, dialog, dan inspector.
- `src/types.ts`: tipe Asset, Project, AssetCategory, MoveOperation, dan tipe pendukung.
- `src/lib/filesystem.ts`: batas command Tauri bertipe dan pemilih folder native.
- `src/lib/thumbnails.ts`: cache thumbnail berbatas, batas concurrency, dan pemuatan berdasarkan viewport.
- `src/components/MediaPreview.tsx`, `UndoPreview.tsx`: preview gambar/video/audio dan konfirmasi undo.
- `src/lib/keyboard.ts`: helper navigasi keyboard.
- `src/lib/format.ts`: helper tampilan dan kategori.
- `src/lib/model.ts`: pemuatan GLTF/GLB, decoder, metadata, pemusatan, dan pelepasan resource.
- `src-tauri/src/filesystem.rs`: klasifikasi, scan, rencana, validasi path, pemindahan tanpa overwrite, dan tes keamanan.
- `src-tauri/src/model.rs`: pembacaan resource model dengan batas ukuran dan tes isolasi path.
- `src-tauri/src/lib.rs`: command async, sesi proyek, rencana organisasi/undo, dan konfigurasi keamanan worker.
- `src-tauri/src/dependencies.rs`: pembacaan manifest GLTF/GLB dan grup dependensi.
- `src-tauri/src/undo.rs`: jurnal pemindahan persisten, rekonsiliasi setelah crash, dan validasi undo.
- `scripts/perf-bench.cjs`: benchmark performa build release.
- `scripts/desktop.mjs`: launcher toolchain desktop.
- `scripts/copy-decoders.mjs`: menyiapkan decoder lokal dan worker Basis statis.
- `images/`: screenshot dokumentasi.

Frontend meminta operasi melalui command Tauri; Rust mengelola akses filesystem dan rencana organisasi. Three.js dimuat secara lazy. Worker Basis mendapat CSP terbatas untuk kebutuhan runtime-nya tanpa akses jaringan, sementara antarmuka utama tetap memblokir `unsafe-eval`.

## Backlog

Rencana berikutnya (deteksi duplikat, tag dan koleksi virtual, preset aturan, ekspor manifest terpisah) dijelaskan di [docs/BACKLOG.md](BACKLOG.md).

## Kontribusi dan kepemilikan

Laporan bug sebaiknya menyertakan versi aplikasi, versi Windows, langkah reproduksi, dan pesan kesalahan terkait. Gunakan proyek contoh yang aman dibagikan, bukan aset pribadi. Sebelum mengusulkan perubahan kode, jalankan `npm run build` dan `npm run test:rust`, ditambah pemeriksaan native yang relevan untuk perubahan filesystem atau viewer.

## Lisensi

AssetFlow menggunakan [Lisensi MIT](../LICENSE). Hak cipta © 2026 Jordy Lian Ferdinand (odyworks). Kode boleh digunakan, dimodifikasi, didistribusikan, dan dijual dengan tetap menyertakan pemberitahuan hak cipta dan lisensi. Perangkat lunak disediakan tanpa jaminan. Dependensi pihak ketiga tetap mengikuti lisensinya masing-masing.
