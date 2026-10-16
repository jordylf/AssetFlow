use crate::filesystem::validate_file;
use std::{
    fs::File,
    io::Read,
    path::{Component, Path},
};

// Resource paths are resolved relative to a verified model, never against an arbitrary drive.
pub fn read_resource(
    root: &Path,
    model_path: &Path,
    resource: Option<&str>,
) -> Result<Vec<u8>, String> {
    let model = std::fs::canonicalize(model_path).map_err(|e| format!("Cannot open model: {e}"))?;
    let relative = model
        .strip_prefix(root)
        .map_err(|_| "The model is outside the open project.")?;
    let model = validate_file(root, relative)?;
    if !matches!(
        model
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("glb" | "gltf")
    ) {
        return Err("The 3D inspector supports GLB and GLTF files.".into());
    }
    let target = if let Some(resource) = resource {
        if resource.is_empty() || resource.contains(':') || resource.contains('\0') {
            return Err("Only local model resources inside this project are allowed.".into());
        }
        let mut relative = model
            .parent()
            .ok_or("Invalid model folder")?
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_path_buf();
        for component in Path::new(resource).components() {
            match component {
                Component::Normal(part) => relative.push(part),
                Component::CurDir => {}
                Component::ParentDir => {
                    if !relative.pop() {
                        return Err("The model resource is outside the open project.".into());
                    }
                }
                _ => return Err("Absolute model resource paths are not allowed.".into()),
            }
        }
        validate_file(root, &relative)
            .map_err(|e| format!("Cannot read model resource {resource}: {e}"))?
    } else {
        model
    };
    let mut file =
        File::open(&target).map_err(|e| format!("Cannot read {}: {e}", target.display()))?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("A model resource must be a regular file.".into());
    }
    // ponytail: bounded in-memory loading; streaming decoders are needed beyond this ceiling.
    const LIMIT: u64 = 512 * 1024 * 1024;
    if file.metadata().map_err(|e| e.to_string())?.len() > LIMIT {
        return Err("This resource exceeds the inspector's 512 MB per-file limit.".into());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Could not finish reading the model resource: {e}"))?;
    if bytes.len() as u64 > LIMIT {
        return Err("This resource exceeds the inspector's 512 MB per-file limit.".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_resources_stay_in_the_project() {
        let temp = std::env::temp_dir().join(format!(
            "assetflow-model-test-{}-{}",
            std::process::id(),
            crate::filesystem::now()
        ));
        std::fs::create_dir_all(temp.join("project/models")).unwrap();
        std::fs::create_dir(temp.join("project/textures")).unwrap();
        std::fs::write(temp.join("project/models/model.gltf"), b"{}").unwrap();
        std::fs::write(temp.join("project/textures/base color.png"), b"texture").unwrap();
        std::fs::write(temp.join("outside.bin"), b"private").unwrap();
        let root = std::fs::canonicalize(temp.join("project")).unwrap();
        let model = root.join("models/model.gltf");
        assert_eq!(read_resource(&root, &model, None).unwrap(), b"{}");
        assert_eq!(
            read_resource(&root, &model, Some("../textures/base color.png")).unwrap(),
            b"texture"
        );
        for path in [
            "../../outside.bin",
            "https://example.com/a.bin",
            "/outside.bin",
            "missing.bin",
        ] {
            assert!(read_resource(&root, &model, Some(path)).is_err(), "{path}");
        }
        assert!(read_resource(&root, &temp.join("outside.bin"), None).is_err());
        assert_eq!(std::fs::read(temp.join("outside.bin")).unwrap(), b"private");
        assert!(temp
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("assetflow-model-test-"));
        std::fs::remove_dir_all(temp).unwrap();
    }
}
