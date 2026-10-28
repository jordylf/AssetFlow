use crate::{
    dependencies::inspect_references,
    filesystem::{self, display_path, file_modified, is_link, validate_file, Asset},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

#[derive(Serialize)]
pub struct HealthIssue {
    pub severity: &'static str,
    pub path: String,
    pub message: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub path: String,
    pub checked_at: u64,
    pub files: usize,
    pub models: usize,
    pub errors: usize,
    pub warnings: usize,
    pub issues: Vec<HealthIssue>,
    pub truncated: bool,
}
pub fn health(root: &Path) -> Result<HealthReport, String> {
    let project = filesystem::scan(root)?;
    let mut report = HealthReport {
        path: project.path,
        checked_at: filesystem::now(),
        files: project.assets.len(),
        models: 0,
        errors: 0,
        warnings: 0,
        issues: vec![],
        truncated: false,
    };
    let mut add = |severity, path: String, message: String| {
        if severity == "error" {
            report.errors += 1;
        } else {
            report.warnings += 1;
        }
        if report.issues.len() < 1000 {
            report.issues.push(HealthIssue {
                severity,
                path,
                message,
            });
        } else {
            report.truncated = true;
        }
    };
    for warning in project.warnings {
        add("warning", "Project scan".into(), warning);
    }
    for asset in &project.assets {
        if asset.size == 0 {
            add(
                "warning",
                asset.relative_path.clone(),
                "This file is empty (0 bytes). Confirm that it is intentional.".into(),
            );
        }
        if asset.size >= 512 * 1024 * 1024 {
            add("warning", asset.relative_path.clone(), "Large asset (512 MiB or more). Preview or transfer may require additional memory and time.".into());
        }
        if matches!(asset.extension.as_str(), "gltf" | "glb") {
            report.models += 1;
            for issue in inspect_references(root, asset).1 {
                add("error", asset.relative_path.clone(), issue);
            }
        }
    }
    Ok(report)
}

#[derive(Clone, Serialize)]
pub struct PackageItem {
    pub path: String,
    pub size: u64,
    pub category: String,
    pub dependency: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagePlan {
    pub id: String,
    pub files: Vec<PackageItem>,
    pub total_bytes: u64,
    pub requested: usize,
    pub issues: Vec<String>,
    pub notes: Vec<String>,
}
pub struct PendingPackage {
    pub preview: PackagePlan,
    pub root: PathBuf,
    files: Vec<Asset>,
}
pub fn prepare(root: &Path, paths: Vec<String>, id: String) -> Result<PendingPackage, String> {
    if paths.is_empty() || paths.len() > 5000 {
        return Err("Select 1–5,000 assets to package.".into());
    }
    let project = filesystem::scan(root)?;
    let index: HashMap<String, &Asset> = project
        .assets
        .iter()
        .map(|a| (a.relative_path.to_lowercase(), a))
        .collect();
    let requested: HashSet<String> = paths.into_iter().map(|p| p.to_lowercase()).collect();
    let mut queue: Vec<String> = requested.iter().cloned().collect();
    let mut found = HashSet::new();
    let mut issues = Vec::new();
    let mut files = Vec::new();
    while let Some(key) = queue.pop() {
        if !found.insert(key.clone()) {
            continue;
        }
        if found.len() > 10000 {
            return Err("This package exceeds 10,000 files including dependencies. Choose a smaller collection.".into());
        }
        let asset = index.get(&key).ok_or_else(|| {
            format!(
                "A selected asset is missing or unsafe: {key}. Refresh and review the selection."
            )
        })?;
        let file = validate_file(root, Path::new(&asset.relative_path))?;
        if !file.is_file() {
            return Err("Only regular files can be packaged.".into());
        }
        if matches!(asset.extension.as_str(), "gltf" | "glb") {
            let (resources, problems) = inspect_references(root, asset);
            for problem in problems {
                if issues.len() < 1000 {
                    issues.push(format!("{}: {problem}", asset.relative_path));
                }
            }
            queue.extend(
                resources
                    .into_iter()
                    .map(|p| p.to_string_lossy().replace('\\', "/").to_lowercase()),
            );
        }
        files.push((**asset).clone());
    }
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    let mut notes = vec!["Dependency collection covers GLTF/GLB buffers and textures only. Blender, Adobe, video-editor and source-code references are not analyzed.".into(), "Files are copied with their project-relative paths under assets/. Originals are never moved. A partial package is retained and clearly marked if cancelled or interrupted.".into()];
    if !project.warnings.is_empty() {
        notes.push(format!("The project scan reported {} warnings. Unreadable files and links were not included. Run Health Check for details.", project.warnings.len()));
    }
    let preview = PackagePlan {
        id,
        total_bytes: files.iter().map(|a| a.size).sum(),
        requested: requested.len(),
        files: files
            .iter()
            .map(|a| PackageItem {
                path: a.relative_path.clone(),
                size: a.size,
                category: a.category.clone(),
                dependency: !requested.contains(&a.relative_path.to_lowercase()),
            })
            .collect(),
        issues,
        notes,
    };
    Ok(PendingPackage {
        preview,
        root: root.to_path_buf(),
        files,
    })
}

#[derive(Default)]
pub struct PackageControl {
    pub active: AtomicBool,
    pub cancel: AtomicBool,
}
pub struct ActivePackage<'a>(&'a PackageControl);
impl PackageControl {
    pub fn begin(&self) -> Result<ActivePackage<'_>, String> {
        self.active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "A package is already being collected.")?;
        self.cancel.store(false, Ordering::SeqCst);
        Ok(ActivePackage(self))
    }
}
impl Drop for ActivePackage<'_> {
    fn drop(&mut self) {
        self.0.active.store(false, Ordering::SeqCst);
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageProgress {
    pub id: String,
    pub copied: usize,
    pub total: usize,
    pub bytes: u64,
    pub total_bytes: u64,
    pub file: String,
}
#[derive(Serialize)]
pub struct PackageResult {
    pub path: String,
    pub copied: usize,
    pub total: usize,
    pub complete: bool,
    pub error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    path: String,
    size: u64,
    modified: u64,
    category: String,
    sha256: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest<'a> {
    format: &'static str,
    created_at: u64,
    complete: bool,
    files: &'a [ManifestEntry],
    notes: &'a [String],
}

fn check_source(root: &Path, asset: &Asset) -> Result<File, String> {
    let path = validate_file(root, Path::new(&asset.relative_path))?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    let file = options
        .open(path)
        .map_err(|e| format!("{}: {e}", asset.relative_path))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if is_link(&metadata)
        || !metadata.is_file()
        || metadata.len() != asset.size
        || file_modified(&metadata) != asset.modified
    {
        return Err(format!(
            "{} changed since the preview. Prepare a new package.",
            asset.relative_path
        ));
    }
    Ok(file)
}
fn create_parents(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let mut current = root.to_path_buf();
    let mut parts = PathBuf::new();
    for part in relative.components() {
        if !matches!(part, std::path::Component::Normal(_)) {
            return Err("Unsafe package path.".into());
        }
        current.push(part);
        parts.push(part);
        match fs::create_dir(&current) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.to_string()),
        }
        let canonical = validate_file(root, &parts)?;
        if !canonical.is_dir() {
            return Err("Package folder was replaced by a file.".into());
        }
    }
    Ok(current)
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())
}
pub fn collect(
    plan: PendingPackage,
    parent: &Path,
    control: &PackageControl,
    emit: impl Fn(PackageProgress),
) -> Result<PackageResult, String> {
    if !plan.preview.issues.is_empty() {
        return Err("Resolve the dependency issues before collecting this package.".into());
    }
    if control.cancel.load(Ordering::SeqCst) {
        return Err("Package collection cancelled.".into());
    }
    let parent =
        fs::canonicalize(parent).map_err(|e| format!("Cannot read destination folder: {e}"))?;
    if !parent.is_dir() || parent.starts_with(&plan.root) {
        return Err("Choose a destination folder outside the source project.".into());
    }
    // Validate every planned source before creating the first output file.
    for asset in &plan.files {
        check_source(&plan.root, asset)?;
    }
    let stem = format!("AssetFlow-package-{}", filesystem::now());
    let mut target = None;
    for n in 0..100 {
        let path = parent.join(if n == 0 {
            stem.clone()
        } else {
            format!("{stem}-{n:02}")
        });
        match fs::create_dir(&path) {
            Ok(()) => {
                target = Some(path);
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Cannot create package folder: {e}")),
        }
    }
    let target = fs::canonicalize(target.ok_or("Could not reserve a new package folder.")?)
        .map_err(|e| e.to_string())?;
    write_new(&target.join("PACKAGE_STATUS.txt"), b"This package is INCOMPLETE until manifest.json exists with complete: true. Check manifest.json before using or sharing. Original project files were not moved.\n")?;
    let mut entries = Vec::new();
    let mut bytes = 0u64;
    let mut last_event = Instant::now() - Duration::from_secs(1);
    let mut buffer = vec![0u8; 128 * 1024];
    let total = plan.files.len();
    let copied = (|| -> Result<(), String> {
        for asset in &plan.files {
            if control.cancel.load(Ordering::SeqCst) {
                return Err("Package collection cancelled. The partial output is retained.".into());
            }
            let mut source = check_source(&plan.root, asset)?;
            let relative = Path::new("assets").join(&asset.relative_path);
            let parent = create_parents(&target, relative.parent().ok_or("Invalid output path")?)?;
            let output = parent.join(relative.file_name().ok_or("Invalid output filename")?);
            let mut dest = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&output)
                .map_err(|e| format!("Cannot create {}: {e}", asset.relative_path))?;
            let mut hash = Sha256::new();
            let mut copied_bytes = 0u64;
            loop {
                if control.cancel.load(Ordering::SeqCst) {
                    return Err(
                        "Package collection cancelled. The partial output is retained.".into(),
                    );
                }
                let count = source.read(&mut buffer).map_err(|e| e.to_string())?;
                if count == 0 {
                    break;
                }
                dest.write_all(&buffer[..count])
                    .map_err(|e| e.to_string())?;
                hash.update(&buffer[..count]);
                copied_bytes += count as u64;
                bytes += count as u64;
                if last_event.elapsed() >= Duration::from_millis(120) {
                    emit(PackageProgress {
                        id: plan.preview.id.clone(),
                        copied: entries.len(),
                        total,
                        bytes,
                        total_bytes: plan.preview.total_bytes,
                        file: asset.relative_path.clone(),
                    });
                    last_event = Instant::now();
                }
            }
            dest.sync_all().map_err(|e| e.to_string())?;
            let metadata = source.metadata().map_err(|e| e.to_string())?;
            if copied_bytes != asset.size
                || metadata.len() != asset.size
                || file_modified(&metadata) != asset.modified
            {
                return Err(format!(
                    "{} changed while it was being copied. Do not use this partial package.",
                    asset.relative_path
                ));
            }
            entries.push(ManifestEntry {
                path: format!("assets/{}", asset.relative_path),
                size: copied_bytes,
                modified: asset.modified,
                category: asset.category.clone(),
                sha256: format!("{:x}", hash.finalize()),
            });
        }
        if control.cancel.load(Ordering::SeqCst) {
            return Err("Package collection cancelled before completion.".into());
        }
        for asset in &plan.files {
            check_source(&plan.root, asset)?;
        }
        write_new(&target.join("README.txt"), format!("AssetFlow package · by odyworks\n\nOpen project assets from assets/. Relative GLTF references are preserved.\nVerify SHA-256 values in manifest.json. complete: true is the authoritative completion marker; PACKAGE_STATUS.txt is a startup/crash-safety note and remains present.\n\n{}\n", plan.preview.notes.join("\n")).as_bytes())?;
        let manifest = Manifest {
            format: "assetflow-package-v1",
            created_at: filesystem::now(),
            complete: true,
            files: &entries,
            notes: &plan.preview.notes,
        };
        write_new(
            &target.join("manifest.pending.json"),
            &serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
        )?;
        filesystem::move_no_replace(
            &target.join("manifest.pending.json"),
            &target.join("manifest.json"),
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })();
    emit(PackageProgress {
        id: plan.preview.id,
        copied: entries.len(),
        total,
        bytes,
        total_bytes: plan.preview.total_bytes,
        file: String::new(),
    });
    Ok(PackageResult {
        path: display_path(&target),
        copied: entries.len(),
        total,
        complete: copied.is_ok(),
        error: copied.err(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reports_all_issues_and_packages_without_mutating_sources() {
        let dir = std::env::temp_dir().join(format!(
            "assetflow-workflow-test-{}-{}",
            std::process::id(),
            filesystem::now()
        ));
        fs::create_dir_all(dir.join("project/models")).unwrap();
        fs::create_dir(dir.join("exports")).unwrap();
        let root = fs::canonicalize(dir.join("project")).unwrap();
        fs::write(root.join("models/item.gltf"), r#"{"asset":{"version":"2.0"},"buffers":[{"uri":"mesh.bin"}],"images":[{"uri":"../tex.png"}]}"#).unwrap();
        fs::write(root.join("models/mesh.bin"), b"mesh").unwrap();
        fs::write(root.join("tex.png"), b"texture").unwrap();
        fs::write(root.join("empty.txt"), b"").unwrap();
        let bad = root.join("broken.gltf");
        fs::write(&bad, r#"{"buffers":[{"uri":"missing-a.bin"},{"uri":"missing-b.bin"},{"uri":"https://example.com/x.bin"}]}"#).unwrap();
        let report = health(&root).unwrap();
        assert_eq!(report.errors, 3);
        assert_eq!(report.warnings, 1);
        let bad_plan = prepare(&root, vec!["broken.gltf".into()], "bad".into()).unwrap();
        assert_eq!(bad_plan.preview.issues.len(), 3);
        let control = PackageControl::default();
        assert!(collect(bad_plan, &dir.join("exports"), &control, |_| {}).is_err());
        let plan = prepare(&root, vec!["models/item.gltf".into()], "good".into()).unwrap();
        assert_eq!(plan.preview.files.len(), 3);
        assert_eq!(plan.preview.requested, 1);
        let result = collect(plan, &dir.join("exports"), &control, |_| {}).unwrap();
        assert!(result.complete);
        let target = PathBuf::from(result.path);
        assert_eq!(fs::read(target.join("assets/tex.png")).unwrap(), b"texture");
        assert_eq!(fs::read(root.join("tex.png")).unwrap(), b"texture");
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(target.join("manifest.json")).unwrap()).unwrap();
        assert_eq!(manifest["complete"], true);
        assert_eq!(manifest["files"].as_array().unwrap().len(), 3);
        for entry in manifest["files"].as_array().unwrap() {
            let bytes = fs::read(target.join(entry["path"].as_str().unwrap())).unwrap();
            assert_eq!(entry["sha256"], format!("{:x}", Sha256::digest(bytes)));
        }
        // A known valid resource remains grouped even if another model using it is broken.
        fs::write(
            &bad,
            r#"{"buffers":[{"uri":"tex.png"},{"uri":"missing.bin"}]}"#,
        )
        .unwrap();
        let assets = filesystem::scan(&root).unwrap().assets;
        let groups = crate::dependencies::groups(&root, &assets);
        assert!(groups
            .iter()
            .any(|g| g.models.len() == 2 && g.blocked.is_some()));
        let cancel_plan = prepare(&root, vec!["empty.txt".into()], "cancel".into()).unwrap();
        control.cancel.store(true, Ordering::SeqCst);
        assert!(collect(cancel_plan, &dir.join("exports"), &control, |_| {}).is_err());
        control.cancel.store(false, Ordering::SeqCst);
        fs::write(root.join("large.bin"), vec![7u8; 1024 * 1024]).unwrap();
        let partial_plan = prepare(&root, vec!["large.bin".into()], "partial".into()).unwrap();
        let partial = collect(partial_plan, &dir.join("exports"), &control, |_| {
            control.cancel.store(true, Ordering::SeqCst)
        })
        .unwrap();
        assert!(!partial.complete);
        assert!(!Path::new(&partial.path).join("manifest.json").exists());
        assert_eq!(
            fs::metadata(root.join("large.bin")).unwrap().len(),
            1024 * 1024
        );
        control.cancel.store(false, Ordering::SeqCst);
        let stale = prepare(&root, vec!["tex.png".into()], "stale".into()).unwrap();
        fs::write(root.join("tex.png"), b"changed texture").unwrap();
        assert!(collect(stale, &dir.join("exports"), &control, |_| {}).is_err());
        assert!(prepare(&root, vec!["../outside.txt".into()], "unsafe".into()).is_err());
        assert!(dir
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("assetflow-workflow-test-"));
        fs::remove_dir_all(dir).unwrap();
    }
}
