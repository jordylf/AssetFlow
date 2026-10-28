use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[derive(Clone, Serialize)]
pub struct Change {
    pub id: u64,
    pub path: String,
    pub error: Option<String>,
}
enum Signal {
    Changed,
    Error(String),
    Stop,
}

pub struct ProjectWatch {
    pub id: u64,
    watcher: Option<RecommendedWatcher>,
    stop: Arc<AtomicBool>,
    tx: SyncSender<Signal>,
    thread: Option<JoinHandle<()>>,
}
impl ProjectWatch {
    pub fn start(
        root: &Path,
        id: u64,
        emit: impl Fn(Change) + Send + 'static,
    ) -> Result<Self, String> {
        let (tx, rx) = mpsc::sync_channel(8);
        let callback = tx.clone();
        let mut watcher = RecommendedWatcher::new(
            move |event: notify::Result<notify::Event>| {
                let signal = match event {
                    Ok(e) if e.kind.is_access() => return,
                    Ok(_) => Signal::Changed,
                    Err(e) => Signal::Error(e.to_string()),
                };
                // A full queue already guarantees a refresh; never grow a queue during an export/build.
                let _ = callback.try_send(signal);
            },
            Config::default().with_follow_symlinks(false),
        )
        .map_err(|e| format!("Live updates unavailable: {e}"))?;
        watcher
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| format!("Cannot watch this folder: {e}"))?;
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let path = crate::filesystem::display_path(root);
        let worker = thread::Builder::new()
            .name("assetflow-watch-events".into())
            .spawn(move || {
                while let Ok(first) = rx.recv() {
                    if stopping.load(Ordering::Relaxed) || matches!(first, Signal::Stop) {
                        break;
                    }
                    let started = Instant::now();
                    let mut last = started;
                    let mut error = if let Signal::Error(e) = first {
                        Some(e)
                    } else {
                        None
                    };
                    loop {
                        if stopping.load(Ordering::Relaxed) {
                            return;
                        }
                        let quiet = Duration::from_millis(450).saturating_sub(last.elapsed());
                        let cap = Duration::from_secs(2).saturating_sub(started.elapsed());
                        if quiet.is_zero() || cap.is_zero() {
                            break;
                        }
                        match rx.recv_timeout(quiet.min(cap)) {
                            Ok(Signal::Stop) => return,
                            Ok(Signal::Error(e)) => {
                                error = Some(e);
                                last = Instant::now();
                            }
                            Ok(Signal::Changed) => last = Instant::now(),
                            Err(mpsc::RecvTimeoutError::Timeout) => break,
                            Err(_) => return,
                        }
                    }
                    if !stopping.load(Ordering::Relaxed) {
                        emit(Change {
                            id,
                            path: path.clone(),
                            error,
                        });
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            id,
            watcher: Some(watcher),
            stop,
            tx,
            thread: Some(worker),
        })
    }
}
impl Drop for ProjectWatch {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        drop(self.watcher.take());
        let _ = self.tx.try_send(Signal::Stop);
        if let Some(worker) = self.thread.take() {
            let _ = worker.join();
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn watches_recursively_coalesces_and_stops() {
        let root = std::env::temp_dir().join(format!(
            "assetflow-watch-test-{}-{}",
            std::process::id(),
            crate::filesystem::now()
        ));
        std::fs::create_dir_all(root.join("nested")).unwrap();
        let (tx, rx) = mpsc::channel();
        let watch = ProjectWatch::start(&root, 42, move |event| {
            let _ = tx.send(event);
        })
        .unwrap();
        for n in 0..20 {
            std::fs::write(root.join("nested/item.txt"), n.to_string()).unwrap();
        }
        let event = rx.recv_timeout(Duration::from_secs(6)).unwrap();
        assert_eq!(event.id, 42);
        assert!(event.error.is_none());
        drop(watch);
        while rx.try_recv().is_ok() {}
        std::fs::write(root.join("after-stop.txt"), "done").unwrap();
        assert!(rx.recv_timeout(Duration::from_millis(650)).is_err());
        assert!(root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("assetflow-watch-test-"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
