use crate::filesystem::{validate_file, Asset};
use serde::Deserialize;
use std::{
    collections::HashMap,
    fs::File,
    io::Read,
    path::{Component, Path, PathBuf},
};

// Only the manifest is read: the whole .gltf (JSON) or the JSON chunk of a .glb, never binary data.
const MANIFEST_LIMIT: u64 = 64 * 1024 * 1024;

#[derive(Deserialize)]
struct Uri {
    uri: Option<String>,
}
#[derive(Deserialize)]
struct Manifest {
    #[serde(default)]
    buffers: Vec<Uri>,
    #[serde(default)]
    images: Vec<Uri>,
}

fn manifest(path: &Path) -> Result<Manifest, String> {
    let mut file = File::open(path).map_err(|e| format!("cannot be read: {e}"))?;
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let mut header = [0u8; 20];
    let glb = len >= 20 && {
        file.read_exact(&mut header).map_err(|e| e.to_string())?;
        &header[0..4] == b"glTF"
    };
    let json = if glb {
        let size = u32::from_le_bytes(header[12..16].try_into().unwrap()) as u64;
        if &header[16..20] != b"JSON" || size > MANIFEST_LIMIT || 20 + size > len {
            return Err("has an invalid GLB header".into());
        }
        let mut json = vec![0; size as usize];
        file.read_exact(&mut json).map_err(|e| e.to_string())?;
        json
    } else {
        if len > MANIFEST_LIMIT {
            return Err("is too large to inspect for dependencies".into());
        }
        let mut json = if len >= 20 {
            header.to_vec()
        } else {
            Vec::new()
        };
        file.read_to_end(&mut json).map_err(|e| e.to_string())?;
        json
    };
    serde_json::from_slice(&json).map_err(|_| "is not valid glTF JSON".into())
}
fn percent_decode(uri: &str) -> Option<String> {
    let bytes = uri.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}
/// Read only the manifest; collect every issue while retaining valid shared resources.
pub fn inspect_references(root: &Path, model: &Asset) -> (Vec<PathBuf>, Vec<String>) {
    let relative = Path::new(&model.relative_path);
    let doc = match validate_file(root, relative).and_then(|file| manifest(&file)) {
        Ok(doc) => doc,
        Err(error) => return (vec![], vec![error]),
    };
    let mut found = Vec::new();
    let mut issues = Vec::new();
    for uri in doc
        .buffers
        .iter()
        .chain(&doc.images)
        .filter_map(|u| u.uri.as_deref())
    {
        if uri.starts_with("data:") {
            continue;
        }
        let resolve = || -> Result<PathBuf, String> {
            let scheme = uri.split_once(':').is_some_and(|(s, _)| {
                !s.is_empty()
                    && s.chars()
                        .all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))
            });
            if scheme || uri.starts_with('/') || uri.starts_with('\\') {
                return Err(format!(
                    "references an external URL or absolute path ({uri})"
                ));
            }
            let decoded = percent_decode(uri)
                .ok_or_else(|| format!("has an invalid resource URI ({uri})"))?;
            let mut path = relative.parent().unwrap_or(Path::new("")).to_path_buf();
            for part in Path::new(&decoded).components() {
                match part {
                    Component::Normal(p) => path.push(p),
                    Component::CurDir => {}
                    Component::ParentDir if path.pop() => {}
                    _ => return Err(format!("references a file outside the project ({uri})")),
                }
            }
            let file = validate_file(root, &path)
                .map_err(|_| format!("references a missing or unsafe file ({decoded})"))?;
            if !file.is_file() {
                return Err(format!(
                    "references a directory instead of a file ({decoded})"
                ));
            }
            Ok(path)
        };
        match resolve() {
            Ok(path) => found.push(path),
            Err(error) => issues.push(error.chars().take(600).collect()),
        }
    }
    (found, issues)
}

pub struct Group {
    /// Asset indexes, models and resources together.
    pub members: Vec<usize>,
    pub models: Vec<usize>,
    pub blocked: Option<String>,
}
fn find(parent: &mut [usize], mut i: usize) -> usize {
    while parent[i] != i {
        parent[i] = parent[parent[i]];
        i = parent[i];
    }
    i
}
/// GLTF/GLB models with external files, merged when they share a resource.
pub fn groups(root: &Path, assets: &[Asset]) -> Vec<Group> {
    let index: HashMap<String, usize> = assets
        .iter()
        .enumerate()
        .map(|(i, a)| (a.relative_path.to_lowercase(), i))
        .collect();
    let mut parent: Vec<usize> = (0..assets.len()).collect();
    let mut problems: HashMap<usize, String> = HashMap::new();
    let mut linked = vec![false; assets.len()];
    let mut is_model = vec![false; assets.len()];
    for (i, asset) in assets.iter().enumerate() {
        if !matches!(asset.extension.as_str(), "gltf" | "glb") {
            continue;
        }
        is_model[i] = true;
        let (paths, issues) = inspect_references(root, asset);
        for path in paths {
            let key = path.to_string_lossy().replace('\\', "/").to_lowercase();
            let Some(&j) = index.get(&key) else {
                linked[i] = true;
                problems.insert(i, format!("references a file that was not indexed ({key})"));
                continue;
            };
            linked[i] = true;
            linked[j] = true;
            let (a, b) = (find(&mut parent, i), find(&mut parent, j));
            parent[a] = b;
        }
        if !issues.is_empty() {
            linked[i] = true;
            problems.insert(i, issues.join("; "));
        }
    }
    let mut by_root: HashMap<usize, Group> = HashMap::new();
    for i in (0..assets.len()).filter(|&i| linked[i]) {
        let r = find(&mut parent, i);
        let group = by_root.entry(r).or_insert(Group {
            members: Vec::new(),
            models: Vec::new(),
            blocked: None,
        });
        group.members.push(i);
        if is_model[i] {
            group.models.push(i);
        }
        if let Some(problem) = problems.get(&i) {
            group
                .blocked
                .get_or_insert_with(|| format!("{} {problem}.", assets[i].name));
        }
    }
    let mut list: Vec<Group> = by_root.into_values().collect();
    list.sort_by_key(|g| g.members[0]);
    list
}

/// Deepest folder that contains every member; members keep their paths relative to it.
pub fn common_folder(paths: &[&str]) -> String {
    let mut common: Vec<&str> = paths[0].split('/').collect();
    common.pop();
    for path in &paths[1..] {
        let parts: Vec<&str> = path.split('/').collect();
        let shared = common
            .iter()
            .zip(&parts[..parts.len() - 1])
            .take_while(|(a, b)| a.eq_ignore_ascii_case(b))
            .count();
        common.truncate(shared);
    }
    common.join("/")
}

#[cfg(all(test, windows))]
mod tests {
    use crate::{filesystem, model};
    use std::fs;

    fn gltf(uris: &[&str]) -> String {
        let buffers: Vec<String> = uris
            .iter()
            .map(|u| format!("{{\"uri\":\"{u}\"}}"))
            .collect();
        format!(
            "{{\"asset\":{{\"version\":\"2.0\"}},\"buffers\":[{}]}}",
            buffers.join(",")
        )
    }
    fn glb(json: &str) -> Vec<u8> {
        let mut json = json.as_bytes().to_vec();
        while json.len() % 4 != 0 {
            json.push(b' ');
        }
        let mut out = b"glTF".to_vec();
        out.extend(2u32.to_le_bytes());
        out.extend((20 + json.len() as u32).to_le_bytes());
        out.extend((json.len() as u32).to_le_bytes());
        out.extend(b"JSON");
        out.extend(json);
        out
    }

    #[test]
    fn models_keep_their_resources_together() {
        let dir = std::env::temp_dir().join(format!(
            "assetflow-test-deps-{}-{}",
            std::process::id(),
            filesystem::now()
        ));
        for folder in [
            "shots/car",
            "shots/truck",
            "shots/tex",
            "03_Models/car",
            "solo",
        ] {
            fs::create_dir_all(dir.join(folder)).unwrap();
        }
        let w = |p: &str, b: &[u8]| fs::write(dir.join(p), b).unwrap();
        w(
            "shots/car/car.gltf",
            gltf(&["car.bin", "../tex/paint%20coat.png"]).as_bytes(),
        );
        w("shots/car/car.bin", b"car");
        w(
            "shots/truck/truck.gltf",
            gltf(&["../tex/paint coat.png"]).as_bytes(),
        );
        w("shots/tex/paint coat.png", b"shared");
        w("solo/rig.glb", &glb(&gltf(&["rig.bin"])));
        w("solo/rig.bin", b"rig");
        w("lone.gltf", gltf(&["missing.bin"]).as_bytes());
        w(
            "remote.gltf",
            gltf(&["https://example.com/a.bin"]).as_bytes(),
        );
        w("embedded.glb", &glb("{\"asset\":{\"version\":\"2.0\"}}"));
        w("tiny.gltf", b"{}");
        w("03_Models/car/keep.txt", b"existing folder");
        let root = fs::canonicalize(&dir).unwrap();
        let plan = filesystem::prepare(&root, "deps".into()).unwrap();
        let groups = &plan.preview.groups;
        let moving: Vec<_> = groups.iter().filter(|g| g.destination.is_some()).collect();
        assert_eq!(moving.len(), 2, "{groups:?}");
        let shared = moving.iter().find(|g| g.models.len() == 2).unwrap();
        assert_eq!(shared.destination.as_deref(), Some("03_Models/car_01"));
        assert_eq!(shared.files.len(), 4);
        let blocked: Vec<_> = groups.iter().filter(|g| g.blocked.is_some()).collect();
        assert_eq!(
            blocked.len(),
            2,
            "missing and remote references block their model"
        );
        let to = |from: &str| {
            plan.preview
                .operations
                .iter()
                .find(|o| o.from == from)
                .map(|o| o.to.clone())
        };
        assert_eq!(
            to("shots/tex/paint coat.png").as_deref(),
            Some("03_Models/car_01/tex/paint coat.png")
        );
        assert_eq!(to("solo/rig.bin").as_deref(), Some("03_Models/rig/rig.bin"));
        assert_eq!(to("lone.gltf"), None);
        assert_eq!(to("remote.gltf"), None);
        assert_eq!(
            to("embedded.glb").as_deref(),
            Some("03_Models/embedded.glb")
        );
        assert_eq!(
            to("tiny.gltf").as_deref(),
            Some("03_Models/tiny.gltf"),
            "small manifests parse"
        );
        let journal = dir.with_extension("jsonl");
        let result = filesystem::execute(&root, plan, &journal).unwrap();
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        // Relative references still resolve from the new locations.
        for (model, resource, bytes) in [
            (
                "03_Models/car_01/car/car.gltf",
                "../tex/paint coat.png",
                &b"shared"[..],
            ),
            ("03_Models/car_01/car/car.gltf", "car.bin", b"car"),
            (
                "03_Models/car_01/truck/truck.gltf",
                "../tex/paint coat.png",
                b"shared",
            ),
            ("03_Models/rig/rig.glb", "rig.bin", b"rig"),
        ] {
            assert_eq!(
                model::read_resource(&root, &root.join(model), Some(resource)).unwrap(),
                bytes
            );
        }
        assert!(root.join("lone.gltf").exists());
        assert_eq!(
            fs::read(root.join("08_Documents/keep.txt")).unwrap(),
            b"existing folder"
        );
        let again = filesystem::prepare(&root, "again".into()).unwrap();
        assert!(
            again.preview.operations.is_empty(),
            "{:?}",
            again.preview.operations
        );
        let _ = fs::remove_file(&journal);
        assert!(dir
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("assetflow-test-deps-"));
        fs::remove_dir_all(dir).unwrap();
    }
}
