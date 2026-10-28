use crate::filesystem::{display_path, validate_file};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

/// Validate the original path before canonicalization so links cannot disappear from the check.
pub fn project_file(root: &Path, path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    let plain_root = PathBuf::from(display_path(root));
    let relative = path
        .strip_prefix(root)
        .or_else(|_| path.strip_prefix(&plain_root))
        .map_err(|_| "This file is outside the open project.")?;
    let file = validate_file(root, relative)?;
    if !file.is_file() {
        return Err("Choose a regular file.".into());
    }
    Ok(file)
}

#[cfg(windows)]
pub fn open_with(file: &Path, parent: isize) -> Result<(), String> {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt};
    let ext = file
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    if [
        "exe", "com", "bat", "cmd", "ps1", "msi", "lnk", "url", "hta", "vbs", "scr",
    ]
    .contains(&ext.as_str())
    {
        return Err(
            "Open With is available for project assets, not executable files or shortcuts.".into(),
        );
    }
    #[repr(C)]
    struct OpenAsInfo {
        file: *const u16,
        class: *const u16,
        flags: u32,
    }
    #[link(name = "shell32")]
    extern "system" {
        fn SHOpenWithDialog(hwnd: isize, info: *const OpenAsInfo) -> i32;
    }
    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(reserved: *const c_void, mode: u32) -> i32;
        fn CoUninitialize();
    }
    let wide: Vec<u16> = std::ffi::OsStr::new(&display_path(file))
        .encode_wide()
        .chain(Some(0))
        .collect();
    unsafe {
        let init = CoInitializeEx(std::ptr::null(), 2); // An STA for this short-lived dialog thread.
        if init < 0 {
            return Err(format!(
                "Cannot initialize the Windows app chooser (0x{:08X}).",
                init as u32
            ));
        }
        let result = SHOpenWithDialog(
            parent,
            &OpenAsInfo {
                file: wide.as_ptr(),
                class: std::ptr::null(),
                flags: 4,
            },
        );
        CoUninitialize();
        // Cancelling the chooser is a normal outcome.
        if result < 0 && result as u32 != 0x800704C7 {
            return Err(format!(
                "Windows could not open the app chooser (0x{:08X}).",
                result as u32
            ));
        }
    }
    Ok(())
}

#[derive(Serialize, Debug)]
pub struct MetadataField {
    pub label: String,
    pub value: String,
}
#[derive(Serialize, Debug, Default)]
pub struct TechnicalMetadata {
    pub fields: Vec<MetadataField>,
    pub note: Option<String>,
}

fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) if !s.is_empty() && !matches!(s.as_str(), "N/A" | "unknown" | "0/0") => {
            Some(s.chars().take(160).collect())
        }
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn field(result: &mut TechnicalMetadata, label: &str, value: Option<String>) {
    if let Some(value) = value {
        result.fields.push(MetadataField {
            label: label.into(),
            value,
        });
    }
}
fn rate(value: &Value) -> Option<f64> {
    let s = text(value)?;
    let rate = if let Some((a, b)) = s.split_once('/') {
        a.parse::<f64>().ok()? / b.parse::<f64>().ok()?
    } else {
        s.parse().ok()?
    };
    (rate.is_finite() && rate > 0.).then_some(rate)
}
fn kbps(value: &Value) -> Option<String> {
    Some(format!("{:.0} kb/s", rate(value)? / 1000.))
}

fn parse_metadata(doc: &Value) -> TechnicalMetadata {
    let mut result = TechnicalMetadata::default();
    field(
        &mut result,
        "Container",
        text(&doc["format"]["format_long_name"]),
    );
    field(
        &mut result,
        "Overall bitrate",
        kbps(&doc["format"]["bit_rate"]),
    );
    let streams = doc["streams"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    if let Some(v) = streams.iter().find(|s| s["codec_type"] == "video") {
        field(
            &mut result,
            "Video / image codec",
            text(&v["codec_long_name"]).or_else(|| text(&v["codec_name"])),
        );
        field(&mut result, "Profile", text(&v["profile"]));
        if let (Some(w), Some(h)) = (v["width"].as_u64(), v["height"].as_u64()) {
            field(
                &mut result,
                "Encoded dimensions",
                Some(format!("{w} × {h} px")),
            );
        }
        field(
            &mut result,
            "Frame rate (reported)",
            rate(&v["avg_frame_rate"]).map(|n| format!("{n:.3} fps")),
        );
        field(&mut result, "Video bitrate", kbps(&v["bit_rate"]));
        field(&mut result, "Pixel format", text(&v["pix_fmt"]));
        field(
            &mut result,
            "Bit depth",
            rate(&v["bits_per_raw_sample"]).map(|n| format!("{n:.0} bit")),
        );
        field(
            &mut result,
            "Display aspect ratio",
            text(&v["display_aspect_ratio"]),
        );
        field(&mut result, "Color primaries", text(&v["color_primaries"]));
        field(&mut result, "Color transfer", text(&v["color_transfer"]));
        field(&mut result, "Color space", text(&v["color_space"]));
        field(&mut result, "Color range", text(&v["color_range"]));
    }
    if let Some(a) = streams.iter().find(|s| s["codec_type"] == "audio") {
        field(
            &mut result,
            "Audio codec",
            text(&a["codec_long_name"]).or_else(|| text(&a["codec_name"])),
        );
        field(
            &mut result,
            "Sample rate",
            rate(&a["sample_rate"]).map(|n| format!("{:.1} kHz", n / 1000.)),
        );
        field(
            &mut result,
            "Channels",
            text(&a["channel_layout"]).or_else(|| text(&a["channels"])),
        );
        field(&mut result, "Sample format", text(&a["sample_fmt"]));
        field(
            &mut result,
            "Audio bit depth",
            rate(&a["bits_per_raw_sample"])
                .or_else(|| rate(&a["bits_per_sample"]))
                .map(|n| format!("{n:.0} bit")),
        );
        field(&mut result, "Audio bitrate", kbps(&a["bit_rate"]));
    }
    if result.fields.is_empty() {
        result.note = Some("No additional technical metadata was reported for this file.".into());
    }
    result
}

static PROBE: Mutex<()> = Mutex::new(());
pub fn technical_metadata(file: &Path) -> Result<TechnicalMetadata, String> {
    let ext = file
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    if ![
        "mp4", "mov", "mkv", "webm", "wav", "mp3", "flac", "aac", "png", "jpg", "jpeg", "webp",
        "gif", "bmp", "tif", "tiff", "exr",
    ]
    .contains(&ext.as_str())
    {
        return Ok(TechnicalMetadata { fields: vec![], note: Some("Extended metadata is not available for this format. Basic file details remain available.".into()) });
    }
    // No whole-project probing or persistent workers. Only one bounded probe at a time.
    let _guard = PROBE
        .try_lock()
        .map_err(|_| "Another metadata read is finishing. Try again in a moment.")?;
    let probe = std::env::var_os("PATH")
        .into_iter()
        .flat_map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .filter(|p| p.is_absolute())
        .map(|p| p.join("ffprobe.exe"))
        .find(|p| p.is_file());
    let Some(probe) = probe else {
        return Ok(TechnicalMetadata { fields: vec![], note: Some("Extended metadata needs ffprobe from FFmpeg on PATH. Restart AssetFlow after installing it; basic previews work without it.".into()) });
    };
    let mut command = Command::new(probe);
    command.args(["-v", "error", "-max_alloc", "67108864", "-threads", "1", "-probesize", "1048576", "-analyzeduration", "1000000",
        "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,mp3,wav,flac,aac,png_pipe,jpeg_pipe,webp_pipe,bmp_pipe,tiff_pipe,exr_pipe,gif",
        "-show_entries", "format=format_long_name,bit_rate:stream=codec_type,codec_name,codec_long_name,profile,width,height,avg_frame_rate,bit_rate,pix_fmt,bits_per_raw_sample,bits_per_sample,display_aspect_ratio,color_space,color_transfer,color_primaries,color_range,sample_rate,channels,channel_layout,sample_fmt", "-of", "json", "-i"])
        .arg(display_path(file)).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot start ffprobe: {e}"))?;
    let output = child.stdout.take().ok_or("Cannot read metadata output.")?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        output.take(262145).read_to_end(&mut bytes).map(|_| bytes)
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if started.elapsed() < Duration::from_secs(8) => {
                std::thread::sleep(Duration::from_millis(25))
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(
                    "Metadata reading timed out. The file may be too complex or damaged."
                        .to_string(),
                );
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(e.to_string());
            }
        }
    };
    let bytes = reader
        .join()
        .map_err(|_| "Metadata reader stopped unexpectedly.")?
        .map_err(|e| e.to_string())?;
    if !status?.success() {
        return Err("ffprobe could not read this file. Its format may be unsupported or its contents damaged.".into());
    }
    if bytes.len() > 262144 {
        return Err("Metadata output exceeds the inspector limit.".into());
    }
    let doc: Value =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid metadata output from ffprobe.")?;
    let mut result = parse_metadata(&doc);
    if !["mp4", "mov", "mkv", "webm"].contains(&ext.as_str()) {
        result.fields.retain(|f| f.label != "Frame rate (reported)");
    }
    Ok(result)
}

#[derive(Deserialize)]
pub struct SheetAsset {
    pub path: String,
    pub thumbnail: Option<String>,
}
fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn valid_thumbnail(s: &str) -> bool {
    s.len() <= 131072
        && s.strip_prefix("data:image/webp;base64,")
            .is_some_and(|data| {
                !data.is_empty()
                    && data
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"+/=".contains(&b))
            })
}
pub fn contact_sheet(
    root: &Path,
    title: &str,
    columns: usize,
    assets: &[SheetAsset],
) -> Result<String, String> {
    if assets.is_empty()
        || assets.len() > 200
        || !(2..=4).contains(&columns)
        || title.chars().count() > 120
    {
        return Err("Choose 1–200 assets, 2–4 columns, and a title up to 120 characters.".into());
    }
    let mut html = format!("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{}</title><style>
        *{{box-sizing:border-box}}body{{font:12px/1.5 'Segoe UI',sans-serif;color:#24282b;background:#f3f4f2;margin:0;padding:32px}}header{{border-bottom:1px solid #cdd3cd;padding-bottom:18px;margin-bottom:24px}}h1{{font-size:24px;line-height:1.2;margin:0 0 8px}}p{{margin:0;color:#59645e}}main{{display:grid;grid-template-columns:repeat({},minmax(0,1fr));gap:18px}}figure{{margin:0;border:1px solid #d2d8d2;border-radius:10px;background:white;overflow:hidden;break-inside:avoid}}.art{{height:150px;background:#e9ede9;display:flex;align-items:center;justify-content:center;color:#748078;font-size:18px}}img{{width:100%;height:100%;object-fit:contain}}figcaption{{padding:12px;overflow-wrap:anywhere}}strong{{display:block;font-size:12px}}small{{display:block;color:#637069;font-size:10px}}footer{{margin-top:24px;color:#637069;font-size:11px}}@page{{size:A4 portrait;margin:12mm}}@media print{{body{{background:white;padding:0}}.print-help{{display:none}}main{{gap:4mm}}.art{{height:35mm}}figure{{border-radius:3mm}}}}
        </style></head><body><header><h1>{}</h1><p>{} assets · AssetFlow · by odyworks</p><p class=\"print-help\">Use your browser’s Print command (Ctrl+P) to print or Save as PDF. Thumbnails are embedded; source files are not included.</p></header><main>", escape(title), columns, escape(title), assets.len());
    let mut total = 0;
    for asset in assets {
        let file = project_file(root, &asset.path)?;
        let metadata = fs::metadata(&file).map_err(|e| e.to_string())?;
        let relative = file
            .strip_prefix(root)
            .map_err(|_| "Invalid project asset.")?
            .to_string_lossy()
            .replace('\\', "/");
        let name = file.file_name().unwrap_or_default().to_string_lossy();
        let ext = file
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_uppercase();
        let artwork = if let Some(data) = &asset.thumbnail {
            total += data.len();
            if total > 12 * 1024 * 1024 || !valid_thumbnail(data) {
                return Err("Invalid or oversized contact sheet thumbnail.".into());
            }
            format!("<img alt=\"\" src=\"{data}\">")
        } else {
            escape(if ext.is_empty() { "FILE" } else { &ext })
        };
        html.push_str(&format!("<figure><div class=\"art\">{artwork}</div><figcaption><strong>{}</strong><small>{}</small><small>{} · {} bytes</small></figcaption></figure>", escape(&name), escape(&relative), escape(&ext), metadata.len()));
    }
    html.push_str("</main><footer>Created locally with AssetFlow · by odyworks. Project-relative paths are included; review before sharing.</footer></body></html>");
    Ok(html)
}
pub fn write_new_sheet(path: &Path, html: &str) -> Result<(), String> {
    if !path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("html"))
    {
        return Err("Save the contact sheet with an .html extension.".into());
    }
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)
        .map_err(|e| format!("Cannot create contact sheet. Choose a new filename; existing files are never overwritten. {e}"))?;
    file.write_all(html.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|e| {
            format!("Contact sheet could not be fully saved: {e}. A partial export may remain.")
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn metadata_and_contact_sheet_are_bounded_and_safe() {
        let data = parse_metadata(
            &serde_json::json!({"streams":[{"codec_type":"video","codec_name":"h264","avg_frame_rate":"30000/1001","width":1920,"height":1080},{"codec_type":"audio","sample_rate":"48000","channels":2,"bits_per_sample":16}]}),
        );
        assert!(data.fields.iter().any(|f| f.value == "29.970 fps"));
        assert!(data.fields.iter().any(|f| f.value == "48.0 kHz"));
        assert!(rate(&Value::String("1/0".into())).is_none());
        assert!(!valid_thumbnail(
            "data:image/svg+xml,<svg onload='alert(1)'/>"
        ));
        let root = std::env::temp_dir().join(format!(
            "assetflow-tools-{}-{}",
            std::process::id(),
            crate::filesystem::now()
        ));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("asset.txt"), "preserve").unwrap();
        let root = fs::canonicalize(root).unwrap();
        let input = vec![SheetAsset {
            path: display_path(&root.join("asset.txt")),
            thumbnail: None,
        }];
        let html = contact_sheet(&root, "<script>alert(1)</script>", 3, &input).unwrap();
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;"));
        assert!(html.contains("default-src 'none'"));
        assert!(project_file(&root, &display_path(&root.join("../outside.txt"))).is_err());
        assert!(contact_sheet(&root, "test", 1, &input).is_err());
        let out = root.join("sheet.html");
        write_new_sheet(&out, &html).unwrap();
        assert!(write_new_sheet(&out, "overwrite").is_err());
        assert_eq!(fs::read_to_string(&out).unwrap(), html);
        assert_eq!(
            fs::read_to_string(root.join("asset.txt")).unwrap(),
            "preserve"
        );
        fs::remove_dir_all(root).unwrap(); // Only this test's newly created, uniquely named fixture.
    }
}
