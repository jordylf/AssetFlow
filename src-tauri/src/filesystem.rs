use serde::Serialize;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub path: String,
    pub relative_path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub modified: u64,
    pub category: String,
    pub kind: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub path: String,
    pub assets: Vec<Asset>,
    pub warnings: Vec<String>,
    pub scanned_at: u64,
}
#[derive(Clone, Debug, Serialize)]
pub struct MoveOperation {
    pub from: String,
    pub to: String,
    pub size: u64,
}
#[derive(Clone, Serialize)]
pub struct OrganizationPlan {
    pub id: String,
    pub operations: Vec<MoveOperation>,
    pub unchanged: usize,
}
pub struct PendingPlan {
    pub preview: OrganizationPlan,
    pub files: Vec<Asset>,
}
#[derive(Debug, Serialize)]
pub struct OrganizationResult {
    pub moved: usize,
    pub errors: Vec<String>,
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else {
        value.trim_start_matches(r"\\?\").to_string()
    }
}
fn modified(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|t| t.as_millis() as u64)
        .unwrap_or(0)
}
fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}
pub fn category_folder(category: &str) -> &'static str {
    match category {
        "References" => "01_References",
        "Design" => "02_Design",
        "Models" => "03_Models",
        "Textures" => "04_Textures",
        "Video" => "05_Video",
        "Audio" => "06_Audio",
        "Exports" => "07_Exports",
        "Documents" => "08_Documents",
        _ => "09_Others",
    }
}
pub fn classify(path: &Path) -> (String, String) {
    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let image = [
        "png", "jpg", "jpeg", "webp", "tiff", "tif", "tga", "exr", "hdr", "gif", "bmp", "avif",
        "svg",
    ]
    .contains(&ext.as_str());
    let texture = image
        && [
            "normal",
            "roughness",
            "metallic",
            "metalness",
            "albedo",
            "diffuse",
            "height",
            "displacement",
            "ao",
            "ambient_occlusion",
            "specular",
            "opacity",
        ]
        .iter()
        .any(|k| stem.contains(k));
    let (category, kind) = if texture {
        ("Textures", "Textures")
    } else if image {
        ("References", "Images")
    } else if ["blend", "glb", "gltf", "fbx", "obj"].contains(&ext.as_str()) {
        ("Models", "3D Models")
    } else if ["psd", "ai", "fig", "xd"].contains(&ext.as_str()) {
        ("Design", "Design Files")
    } else if ["mp4", "mov", "mkv", "webm"].contains(&ext.as_str()) {
        ("Video", "Videos")
    } else if ["wav", "mp3", "flac", "aac"].contains(&ext.as_str()) {
        ("Audio", "Audio")
    } else if ["pdf", "txt", "docx", "md", "rtf"].contains(&ext.as_str()) {
        ("Documents", "Documents")
    } else {
        ("Other", "Other")
    };
    let category = if path
        .parent()
        .map(|p| {
            p.components().any(|c| {
                c.as_os_str()
                    .to_string_lossy()
                    .eq_ignore_ascii_case("07_Exports")
            })
        })
        .unwrap_or(false)
    {
        "Exports"
    } else {
        category
    };
    (category.to_string(), kind.to_string())
}
pub fn scan(root: &Path) -> Result<Project, String> {
    if !root.is_dir() {
        return Err("Choose an existing project folder.".into());
    }
    let mut assets = Vec::new();
    let mut warnings = Vec::new();
    let mut folders = vec![root.to_path_buf()];
    while let Some(folder) = folders.pop() {
        let entries = match fs::read_dir(&folder) {
            Ok(e) => e,
            Err(e) => {
                if folder == root {
                    return Err(format!("Cannot read project folder: {e}"));
                }
                warnings.push(format!("Cannot read {}: {e}", display_path(&folder)));
                continue;
            }
        };
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    warnings.push(e.to_string());
                    continue;
                }
            };
            let path = entry.path();
            let metadata = match fs::symlink_metadata(&path) {
                Ok(m) => m,
                Err(e) => {
                    warnings.push(format!("Cannot read {}: {e}", display_path(&path)));
                    continue;
                }
            };
            if is_link(&metadata) {
                warnings.push(format!(
                    "Skipped symbolic link or junction: {}",
                    display_path(&path)
                ));
                continue;
            }
            if metadata.is_dir() {
                folders.push(path);
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            let relative = path.strip_prefix(root).map_err(|e| e.to_string())?;
            let (category, kind) = classify(relative);
            assets.push(Asset {
                path: display_path(&path),
                relative_path: relative.to_string_lossy().replace('\\', "/"),
                name: entry.file_name().to_string_lossy().into_owned(),
                extension: path
                    .extension()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_lowercase(),
                size: metadata.len(),
                modified: modified(&metadata),
                category,
                kind,
            });
        }
    }
    assets.sort_by(|a, b| {
        a.relative_path
            .to_lowercase()
            .cmp(&b.relative_path.to_lowercase())
    });
    Ok(Project {
        name: root
            .file_name()
            .unwrap_or(root.as_os_str())
            .to_string_lossy()
            .into_owned(),
        path: display_path(root),
        assets,
        warnings,
        scanned_at: now(),
    })
}
pub fn prepare(root: &Path, id: String) -> Result<PendingPlan, String> {
    let project = scan(root)?;
    if !project.warnings.is_empty() {
        return Err(format!(
            "Resolve scan warnings before organizing: {}",
            project.warnings[0]
        ));
    }
    let mut reserved = HashSet::new();
    let mut operations = Vec::new();
    let mut files = Vec::new();
    let mut unchanged = 0;
    for asset in project.assets {
        let folder = category_folder(&asset.category);
        let initial = Path::new(folder).join(&asset.name);
        if asset
            .relative_path
            .eq_ignore_ascii_case(&initial.to_string_lossy().replace('\\', "/"))
        {
            unchanged += 1;
            continue;
        }
        let stem = Path::new(&asset.name)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();
        let ext = Path::new(&asset.name)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let mut target = initial;
        let mut suffix = 1;
        while root
            .join(&target)
            .try_exists()
            .map_err(|e| format!("Cannot check destination: {e}"))?
            || reserved.contains(&target.to_string_lossy().to_lowercase())
        {
            target = Path::new(folder).join(format!("{stem}_{suffix:02}{ext}"));
            suffix += 1;
        }
        reserved.insert(target.to_string_lossy().to_lowercase());
        operations.push(MoveOperation {
            from: asset.relative_path.clone(),
            to: target.to_string_lossy().replace('\\', "/"),
            size: asset.size,
        });
        files.push(asset);
    }
    Ok(PendingPlan {
        preview: OrganizationPlan {
            id,
            operations,
            unchanged,
        },
        files,
    })
}
pub fn validate_file(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    if relative.is_absolute()
        || relative
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("Unsafe relative file path.".into());
    }
    let mut current = root.to_path_buf();
    for part in relative.components() {
        current.push(part);
        let metadata = fs::symlink_metadata(&current)
            .map_err(|e| format!("{}: {e}", display_path(&current)))?;
        if is_link(&metadata) {
            return Err("Symbolic links and junctions are not allowed.".into());
        }
    }
    let canonical = fs::canonicalize(&current).map_err(|e| e.to_string())?;
    if !canonical.starts_with(root) {
        return Err("The file is outside the project folder.".into());
    }
    Ok(canonical)
}
pub fn execute(root: &Path, plan: PendingPlan) -> Result<OrganizationResult, String> {
    // Validate the entire preview before the first move. Paths only come from the stored backend plan.
    for (operation, asset) in plan.preview.operations.iter().zip(&plan.files) {
        let source = validate_file(root, Path::new(&operation.from))?;
        let metadata = fs::metadata(&source).map_err(|e| e.to_string())?;
        if !metadata.is_file()
            || metadata.len() != asset.size
            || modified(&metadata) != asset.modified
        {
            return Err(format!(
                "{} changed since the preview. Review a new organization preview.",
                operation.from
            ));
        }
        let target = root.join(&operation.to);
        if target.try_exists().map_err(|e| e.to_string())? {
            return Err(format!(
                "{} now exists. Review a new preview for a safe filename.",
                operation.to
            ));
        }
        let parent = target.parent().ok_or("Invalid destination")?;
        if parent.exists() {
            validate_file(root, parent.strip_prefix(root).map_err(|e| e.to_string())?)?;
        }
    }
    let mut result = OrganizationResult {
        moved: 0,
        errors: Vec::new(),
    };
    for operation in &plan.preview.operations {
        let attempt = || -> Result<(), String> {
            let source = validate_file(root, Path::new(&operation.from))?;
            let target = root.join(&operation.to);
            let parent = target.parent().ok_or("Invalid destination")?;
            fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create {}: {e}", display_path(parent)))?;
            validate_file(root, parent.strip_prefix(root).map_err(|e| e.to_string())?)?;
            move_no_replace(&source, &target)
                .map_err(|e| format!("Cannot move {} to {}: {e}", operation.from, operation.to))
        };
        match attempt() {
            Ok(()) => result.moved += 1,
            Err(e) => {
                result.errors.push(e);
                break;
            }
        }
    }
    Ok(result)
}
#[cfg(windows)]
fn move_no_replace(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    // No MOVEFILE_REPLACE_EXISTING: Windows atomically refuses an occupied destination.
    if unsafe { MoveFileExW(source.as_ptr(), target.as_ptr(), 0) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}
#[cfg(not(windows))]
fn move_no_replace(_: &Path, _: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Organization currently requires Windows.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn classification_and_safe_organization() {
        for (name, expected) in [
            ("wall_normal.png", "Textures"),
            ("wall_AO.jpg", "Textures"),
            ("chaos.png", "Textures"),
            ("reference.png", "References"),
            ("scene.blend", "Models"),
            ("poster.psd", "Design"),
            ("clip.mov", "Video"),
            ("music.flac", "Audio"),
            ("brief.docx", "Documents"),
            ("code.rs", "Other"),
            ("07_Exports/final.png", "Exports"),
        ] {
            assert_eq!(classify(Path::new(name)).0, expected);
        }
        let dir =
            std::env::temp_dir().join(format!("assetflow-test-{}-{}", std::process::id(), now()));
        fs::create_dir_all(dir.join("nested")).unwrap();
        fs::create_dir(dir.join("04_Textures")).unwrap();
        fs::write(dir.join("wall_normal.png"), b"first").unwrap();
        fs::write(dir.join("nested/wall_normal.png"), b"second").unwrap();
        fs::write(dir.join("04_Textures/wall_normal.png"), b"existing").unwrap();
        let root = fs::canonicalize(&dir).unwrap();
        let plan = prepare(&root, "test".into()).unwrap();
        assert_eq!(plan.preview.operations.len(), 2);
        assert_eq!(plan.preview.unchanged, 1);
        assert_ne!(plan.preview.operations[0].to, plan.preview.operations[1].to);
        assert!(dir.join("wall_normal.png").exists());
        assert!(validate_file(&root, Path::new("../outside")).is_err());
        #[cfg(windows)]
        {
            let collision = root.join(&plan.preview.operations[0].to);
            fs::write(&collision, b"occupied").unwrap();
            assert!(execute(&root, plan).is_err());
            assert!(dir.join("wall_normal.png").exists());
            let plan = prepare(&root, "next".into()).unwrap();
            let result = execute(&root, plan).unwrap();
            assert_eq!(result.moved, 2);
            assert!(result.errors.is_empty());
            assert_eq!(
                fs::read(dir.join("04_Textures/wall_normal.png")).unwrap(),
                b"existing"
            );
            assert!(prepare(&root, "again".into())
                .unwrap()
                .preview
                .operations
                .is_empty());
            let a = root.join("a.txt");
            let b = root.join("b.txt");
            fs::write(&a, b"a").unwrap();
            fs::write(&b, b"b").unwrap();
            assert!(move_no_replace(&a, &b).is_err());
            assert_eq!(fs::read(&a).unwrap(), b"a");
            assert_eq!(fs::read(&b).unwrap(), b"b");
            let stale = prepare(&root, "stale".into()).unwrap();
            fs::write(&a, b"changed after preview").unwrap();
            assert!(execute(&root, stale)
                .unwrap_err()
                .contains("changed since the preview"));
            assert_eq!(fs::read(&a).unwrap(), b"changed after preview");
            assert_eq!(fs::read(&b).unwrap(), b"b");
        }
        // Only remove the uniquely created test fixture, never a user-selected project.
        assert!(dir
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("assetflow-test-"));
        fs::remove_dir_all(dir).unwrap();
    }
}
