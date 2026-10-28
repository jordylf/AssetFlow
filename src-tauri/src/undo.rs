use crate::filesystem::{
    display_path, file_modified, is_link, move_no_replace, validate_file, MoveOperation,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
};

// One JSON object per line. Header + every planned move is written to a temp file, synced and renamed
// into place before the first move. Later lines are appended; a crash can at most lose trailing lines,
// which are reconciled against the filesystem (see `moved`).
#[derive(Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
enum Entry {
    #[serde(rename_all = "camelCase")]
    Header {
        version: u32,
        id: String,
        root: String,
        created_at: u64,
    },
    Intent {
        i: usize,
        from: String,
        to: String,
        size: u64,
        modified: u64,
    },
    Done {
        i: usize,
    },
    Complete,
    Reverted {
        i: usize,
    },
}
fn line(entry: &Entry) -> Result<String, String> {
    serde_json::to_string(entry)
        .map(|s| s + "\n")
        .map_err(|e| e.to_string())
}

pub fn journal_path(dir: &Path, root: &Path) -> PathBuf {
    // FNV-1a: stable across Rust versions, unlike DefaultHasher.
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in display_path(root).to_lowercase().bytes() {
        hash = (hash ^ b as u64).wrapping_mul(0x100000001b3);
    }
    dir.join(format!("{hash:016x}.jsonl"))
}

pub struct Journal {
    file: File,
}
impl Journal {
    pub fn begin(
        path: &Path,
        root: &Path,
        id: &str,
        moves: &[(&MoveOperation, u64)],
    ) -> Result<Self, String> {
        let fail = |e: std::io::Error| format!("Cannot save undo history: {e}");
        fs::create_dir_all(path.parent().ok_or("Invalid journal folder")?).map_err(fail)?;
        let mut text = line(&Entry::Header {
            version: 1,
            id: id.into(),
            root: display_path(root),
            created_at: crate::filesystem::now(),
        })?;
        for (i, (op, modified)) in moves.iter().enumerate() {
            text += &line(&Entry::Intent {
                i,
                from: op.from.clone(),
                to: op.to.clone(),
                size: op.size,
                modified: *modified,
            })?;
        }
        let tmp = path.with_extension("tmp");
        {
            let mut file = File::create(&tmp).map_err(fail)?;
            file.write_all(text.as_bytes()).map_err(fail)?;
            file.sync_all().map_err(fail)?;
        }
        // Replaces the previous journal for this project: only the last organization is undoable.
        fs::rename(&tmp, path).map_err(fail)?;
        Self::open(path)
    }
    fn open(path: &Path) -> Result<Self, String> {
        let fail = |e: std::io::Error| format!("Cannot update undo history: {e}");
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .map_err(fail)?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(fail)?;
        // Drop a torn line left by a crash so new entries start on their own line.
        if !bytes.is_empty() && !bytes.ends_with(b"\n") {
            let keep = bytes.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
            file.set_len(keep as u64).map_err(fail)?;
        }
        file.seek(SeekFrom::End(0)).map_err(fail)?;
        Ok(Self { file })
    }
    fn record(&mut self, entry: &Entry) -> Result<(), String> {
        self.file
            .write_all(line(entry)?.as_bytes())
            .map_err(|e| format!("Cannot update undo history: {e}"))
    }
    pub fn done(&mut self, i: usize) -> Result<(), String> {
        self.record(&Entry::Done { i })
    }
    pub fn complete(&mut self) -> Result<(), String> {
        self.record(&Entry::Complete)?;
        self.file
            .sync_data()
            .map_err(|e| format!("Cannot update undo history: {e}"))
    }
}

struct Recorded {
    from: String,
    to: String,
    size: u64,
    modified: u64,
    done: bool,
    reverted: bool,
}
struct State {
    id: String,
    root: String,
    created_at: u64,
    complete: bool,
    moves: Vec<Recorded>,
}
fn damaged() -> String {
    "The undo history is damaged and cannot be used.".into()
}
fn read(path: &Path) -> Result<Option<State>, String> {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Cannot read undo history: {e}")),
    };
    let mut bytes = Vec::new();
    (&file)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Cannot read undo history: {e}"))?;
    // Lossy decoding: a crash can cut a line inside a multi-byte character.
    let lines: Vec<String> = bytes
        .split(|&b| b == b'\n')
        .filter(|l| !l.is_empty())
        .map(|l| String::from_utf8_lossy(l).into_owned())
        .collect();
    let mut state: Option<State> = None;
    for (n, text) in lines.iter().enumerate() {
        let entry: Entry = match serde_json::from_str(text) {
            Ok(e) => e,
            // A torn final line from a crash is expected; anything else means the journal is damaged.
            Err(_) if n + 1 == lines.len() => break,
            Err(_) => return Err(damaged()),
        };
        match (entry, state.as_mut()) {
            (
                Entry::Header {
                    id,
                    root,
                    created_at,
                    ..
                },
                None,
            ) => {
                state = Some(State {
                    id,
                    root,
                    created_at,
                    complete: false,
                    moves: Vec::new(),
                })
            }
            (
                Entry::Intent {
                    i,
                    from,
                    to,
                    size,
                    modified,
                },
                Some(s),
            ) if i == s.moves.len() => s.moves.push(Recorded {
                from,
                to,
                size,
                modified,
                done: false,
                reverted: false,
            }),
            (Entry::Done { i }, Some(s)) if i < s.moves.len() => s.moves[i].done = true,
            (Entry::Reverted { i }, Some(s)) if i < s.moves.len() => s.moves[i].reverted = true,
            (Entry::Complete, Some(s)) => s.complete = true,
            _ => return Err(damaged()),
        }
    }
    Ok(state)
}

fn safe_relative(path: &str) -> Result<&Path, String> {
    let p = Path::new(path);
    if p.as_os_str().is_empty() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("The undo history contains an unsafe path.".into());
    }
    Ok(p)
}
fn present(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}
fn matches(path: &Path, size: u64, modified: u64) -> bool {
    fs::symlink_metadata(path)
        .map(|m| m.is_file() && !is_link(&m) && m.len() == size && file_modified(&m) == modified)
        .unwrap_or(false)
}
// A planned move without a "done" line may still have happened if the app stopped right after it.
fn moved(root: &Path, m: &Recorded) -> bool {
    m.done || (matches(&root.join(&m.to), m.size, m.modified) && !present(&root.join(&m.from)))
}
fn restored(root: &Path, m: &Recorded) -> bool {
    matches(&root.join(&m.from), m.size, m.modified) && !present(&root.join(&m.to))
}
/// Every existing ancestor of `relative` must be a real folder inside the project.
fn check_folders(root: &Path, relative: &Path) -> Result<(), String> {
    let mut current = root.to_path_buf();
    if let Some(parent) = relative.parent() {
        for part in parent.components() {
            current.push(part);
            match fs::symlink_metadata(&current) {
                Ok(m) if is_link(&m) => {
                    return Err("A folder on the original path is now a link or junction.".into())
                }
                Ok(m) if !m.is_dir() => {
                    return Err("A file now blocks the original folder path.".into())
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    }
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoItem {
    pub from: String,
    pub to: String,
    pub size: u64,
    pub conflict: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoPlan {
    pub id: String,
    pub organized_at: u64,
    pub interrupted: bool,
    pub items: Vec<UndoItem>,
    pub already_restored: usize,
}
pub struct PendingUndo {
    pub preview: UndoPlan,
    journal: PathBuf,
    /// The organization this preview was made for; a newer organization invalidates it.
    organization: String,
    indexes: Vec<usize>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoStatus {
    pub organized_at: u64,
    pub moves: usize,
    pub interrupted: bool,
}
#[derive(Debug, Serialize)]
pub struct UndoResult {
    pub restored: usize,
    pub skipped: usize,
    pub remaining: usize,
    pub errors: Vec<String>,
}

fn load(journal: &Path, root: &Path) -> Result<Option<State>, String> {
    Ok(read(journal)?.filter(|s| s.root.eq_ignore_ascii_case(&display_path(root))))
}
/// Indexes of moves that happened and have not been put back yet, newest first.
fn outstanding(root: &Path, state: &State) -> Vec<usize> {
    (0..state.moves.len())
        .rev()
        .filter(|&i| {
            let m = &state.moves[i];
            !m.reverted && moved(root, m) && !restored(root, m)
        })
        .collect()
}
pub fn status(journal: &Path, root: &Path) -> Result<Option<UndoStatus>, String> {
    let Some(state) = load(journal, root)? else {
        return Ok(None);
    };
    let moves = outstanding(root, &state).len();
    Ok((moves > 0).then_some(UndoStatus {
        organized_at: state.created_at,
        moves,
        interrupted: !state.complete,
    }))
}
fn conflict(root: &Path, m: &Recorded) -> Result<Option<String>, String> {
    let current = safe_relative(&m.to)?;
    let original = safe_relative(&m.from)?;
    if !present(&root.join(current)) {
        return Ok(Some(
            "The file is no longer in its organized location.".into(),
        ));
    }
    if let Err(e) = validate_file(root, current) {
        return Ok(Some(e));
    }
    if !matches(&root.join(current), m.size, m.modified) {
        return Ok(Some("The file changed after organization.".into()));
    }
    if present(&root.join(original)) {
        return Ok(Some("Another file now uses the original location.".into()));
    }
    Ok(check_folders(root, original).err())
}
pub fn prepare(journal: &Path, root: &Path, id: String) -> Result<PendingUndo, String> {
    let state = load(journal, root)?.ok_or("There is no organization to undo for this project.")?;
    let indexes = outstanding(root, &state);
    if indexes.is_empty() {
        return Err("There is no organization to undo for this project.".into());
    }
    let mut items = Vec::new();
    for &i in &indexes {
        let m = &state.moves[i];
        items.push(UndoItem {
            from: m.to.clone(),
            to: m.from.clone(),
            size: m.size,
            conflict: conflict(root, m)?,
        });
    }
    let already_restored = state
        .moves
        .iter()
        .filter(|m| m.reverted || (moved(root, m) && restored(root, m)))
        .count();
    Ok(PendingUndo {
        preview: UndoPlan {
            id,
            organized_at: state.created_at,
            interrupted: !state.complete,
            items,
            already_restored,
        },
        journal: journal.to_path_buf(),
        organization: state.id.clone(),
        indexes,
    })
}
pub fn execute(root: &Path, plan: PendingUndo, skip_conflicts: bool) -> Result<UndoResult, String> {
    let skipped = plan
        .preview
        .items
        .iter()
        .filter(|i| i.conflict.is_some())
        .count();
    if skipped > 0 && !skip_conflicts {
        return Err("Some files cannot be restored. Choose to skip them or cancel.".into());
    }
    let state = load(&plan.journal, root)?
        .filter(|s| s.id == plan.organization)
        .ok_or("This undo preview has expired. Create a new preview.")?;
    let mut journal = Journal::open(&plan.journal)?;
    let mut result = UndoResult {
        restored: 0,
        skipped,
        remaining: 0,
        errors: Vec::new(),
    };
    for (item, &i) in plan.preview.items.iter().zip(&plan.indexes) {
        if item.conflict.is_some() {
            continue;
        }
        let m = state.moves.get(i).ok_or("The undo history changed.")?;
        let attempt = || -> Result<(), String> {
            // Re-check right before moving: the disk may have changed since the preview.
            if let Some(reason) = conflict(root, m)? {
                return Err(format!("{}: {reason} Review a new undo preview.", m.to));
            }
            let source = validate_file(root, Path::new(&m.to))?;
            let target = root.join(&m.from);
            let parent = target.parent().ok_or("Invalid destination")?;
            fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create {}: {e}", display_path(parent)))?;
            validate_file(root, parent.strip_prefix(root).map_err(|e| e.to_string())?)?;
            move_no_replace(&source, &target)
                .map_err(|e| format!("Cannot move {} back to {}: {e}", m.to, m.from))
        };
        match attempt() {
            Ok(()) => {
                result.restored += 1;
                journal.record(&Entry::Reverted { i })?;
            }
            Err(e) => {
                result.errors.push(e);
                break;
            }
        }
    }
    drop(journal);
    result.remaining = load(&plan.journal, root)?
        .as_ref()
        .map_or(0, |s| outstanding(root, s).len());
    if result.remaining == 0 {
        // Only AssetFlow's own history file is removed; user files are never deleted.
        let _ = fs::remove_file(&plan.journal);
    }
    Ok(result)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use crate::filesystem::{self, now};

    fn fixture(name: &str) -> (PathBuf, PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "assetflow-test-undo-{name}-{}-{}",
            std::process::id(),
            now()
        ));
        fs::create_dir_all(dir.join("project/shots")).unwrap();
        fs::write(dir.join("project/shots/wall_normal.png"), b"texture").unwrap();
        fs::write(dir.join("project/brief.txt"), b"brief").unwrap();
        fs::write(dir.join("project/clip.mov"), b"clip").unwrap();
        let root = fs::canonicalize(dir.join("project")).unwrap();
        let journal = journal_path(&dir.join("journals"), &root);
        (dir, root, journal)
    }
    fn cleanup(dir: PathBuf) {
        assert!(dir
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("assetflow-test-undo-"));
        fs::remove_dir_all(dir).unwrap();
    }
    fn organize(root: &Path, journal: &Path) {
        // Plan ids are unique in the app (time + sequence); mirror that here.
        static SEQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let id = format!(
            "p{}",
            SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        let plan = filesystem::prepare(root, id).unwrap();
        let result = filesystem::execute(root, plan, journal).unwrap();
        assert!(result.errors.is_empty());
    }

    #[test]
    fn undo_restores_and_survives_restart() {
        let (dir, root, journal) = fixture("full");
        organize(&root, &journal);
        assert!(root.join("04_Textures/wall_normal.png").exists());
        // Every call re-reads the journal file, as after an app restart.
        let state = status(&journal, &root).unwrap().unwrap();
        assert_eq!(state.moves, 3);
        assert!(!state.interrupted);
        let plan = prepare(&journal, &root, "u".into()).unwrap();
        assert!(plan.preview.items.iter().all(|i| i.conflict.is_none()));
        let result = execute(&root, plan, false).unwrap();
        assert_eq!((result.restored, result.remaining), (3, 0));
        assert_eq!(
            fs::read(root.join("shots/wall_normal.png")).unwrap(),
            b"texture"
        );
        assert!(!journal.exists());
        assert!(status(&journal, &root).unwrap().is_none());
        cleanup(dir);
    }

    #[test]
    fn undo_reports_conflicts_and_never_overwrites() {
        let (dir, root, journal) = fixture("conflict");
        organize(&root, &journal);
        fs::write(root.join("brief.txt"), b"new file at original path").unwrap();
        fs::write(root.join("05_Video/clip.mov"), b"edited after organizing").unwrap();
        let plan = prepare(&journal, &root, "u".into()).unwrap();
        let conflicts = plan
            .preview
            .items
            .iter()
            .filter(|i| i.conflict.is_some())
            .count();
        assert_eq!(conflicts, 2);
        assert!(execute(&root, prepare(&journal, &root, "a".into()).unwrap(), false).is_err());
        assert!(
            root.join("04_Textures/wall_normal.png").exists(),
            "refusing must move nothing"
        );
        let result = execute(&root, plan, true).unwrap();
        assert_eq!(
            (result.restored, result.skipped, result.remaining),
            (1, 2, 2)
        );
        assert_eq!(
            fs::read(root.join("brief.txt")).unwrap(),
            b"new file at original path"
        );
        assert_eq!(
            fs::read(root.join("08_Documents/brief.txt")).unwrap(),
            b"brief"
        );
        assert!(journal.exists(), "skipped files stay undoable");
        // Resolve one conflict; the edited clip stays where it is.
        fs::rename(root.join("brief.txt"), root.join("brief copy.txt")).unwrap();
        let result = execute(&root, prepare(&journal, &root, "v".into()).unwrap(), true).unwrap();
        assert_eq!((result.restored, result.remaining), (1, 1));
        assert_eq!(fs::read(root.join("brief.txt")).unwrap(), b"brief");
        assert_eq!(
            fs::read(root.join("05_Video/clip.mov")).unwrap(),
            b"edited after organizing"
        );
        cleanup(dir);
    }

    #[test]
    fn interrupted_journal_is_reconciled_from_disk() {
        let (dir, root, journal) = fixture("crash");
        let plan = filesystem::prepare(&root, "p".into()).unwrap();
        let ops: Vec<_> = plan
            .preview
            .operations
            .iter()
            .zip(&plan.files)
            .map(|(o, a)| (o, a.modified))
            .collect();
        // Simulated crash: intents are durable, one file moved, its "done" line never written,
        // and a torn trailing line.
        drop(Journal::begin(&journal, &root, "p", &ops).unwrap());
        let first = &plan.preview.operations[0];
        fs::create_dir_all(root.join(first.to.rsplit_once('/').unwrap().0)).unwrap();
        fs::rename(root.join(&first.from), root.join(&first.to)).unwrap();
        OpenOptions::new()
            .append(true)
            .open(&journal)
            .unwrap()
            .write_all(b"{\"t\":\"do")
            .unwrap();
        let state = status(&journal, &root).unwrap().unwrap();
        assert_eq!(state.moves, 1);
        assert!(state.interrupted);
        let result = execute(&root, prepare(&journal, &root, "u".into()).unwrap(), false).unwrap();
        assert_eq!((result.restored, result.remaining), (1, 0));
        assert!(root.join(&first.from).exists());
        // A journal is only applied to the project it was written for.
        organize(&root, &journal);
        let other = fs::canonicalize(dir.join("journals")).unwrap();
        assert!(status(&journal, &other).unwrap().is_none());
        cleanup(dir);
    }

    #[test]
    fn torn_tail_and_stale_preview_are_handled() {
        let (dir, root, journal) = fixture("torn");
        fs::write(root.join("ébauche.txt"), b"draft").unwrap();
        organize(&root, &journal);
        // Crash mid-write inside a two-byte UTF-8 character, with no trailing newline.
        OpenOptions::new()
            .append(true)
            .open(&journal)
            .unwrap()
            .write_all(b"{\"t\":\"intent\",\"from\":\"\xc3")
            .unwrap();
        fs::write(root.join("brief.txt"), b"occupant").unwrap();
        // Several restores append after the torn tail; the journal must stay readable.
        let result = execute(&root, prepare(&journal, &root, "u".into()).unwrap(), true).unwrap();
        assert_eq!((result.restored, result.remaining), (3, 1));
        assert_eq!(fs::read(root.join("ébauche.txt")).unwrap(), b"draft");
        assert_eq!(status(&journal, &root).unwrap().unwrap().moves, 1);
        fs::rename(root.join("brief.txt"), root.join("brief copy.txt")).unwrap();
        let stale = prepare(&journal, &root, "old".into()).unwrap();
        // A newer organization replaces the history; the old preview must not apply to it.
        fs::write(root.join("notes.md"), b"notes").unwrap();
        organize(&root, &journal);
        assert!(execute(&root, stale, true).unwrap_err().contains("expired"));
        assert_eq!(
            fs::read(root.join("08_Documents/notes.md")).unwrap(),
            b"notes"
        );
        assert_eq!(
            fs::read(root.join("08_Documents/brief.txt")).unwrap(),
            b"brief"
        );
        cleanup(dir);
    }
}
