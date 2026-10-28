mod asset_tools;
mod dependencies;
mod filesystem;
mod model;
mod undo;
mod watcher;
mod workflow;
use filesystem::*;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager};

#[derive(Default)]
struct Session {
    root: Option<PathBuf>,
    pending: Option<PendingPlan>,
    pending_undo: Option<undo::PendingUndo>,
    pending_package: Option<workflow::PendingPackage>,
}
struct JournalDir(PathBuf);
type SharedSession = Arc<Mutex<Session>>;
static PLAN_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
async fn scan_project(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedSession>,
) -> Result<Project, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root =
            std::fs::canonicalize(&path).map_err(|e| format!("Cannot open project folder: {e}"))?;
        let project = scan(&root)?;
        app.asset_protocol_scope()
            .allow_directory(&root, true)
            .map_err(|e| e.to_string())?;
        let mut session = state.lock().map_err(|e| e.to_string())?;
        session.root = Some(root);
        session.pending = None;
        session.pending_undo = None;
        session.pending_package = None;
        Ok(project)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn prepare_organization(
    state: tauri::State<'_, SharedSession>,
) -> Result<OrganizationPlan, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = state.lock().map_err(|e| e.to_string())?;
        let root = session.root.as_ref().ok_or("Open a project first.")?;
        let pending = prepare(root, plan_id())?;
        session.pending_package = None;
        session.pending_undo = None;
        let preview = pending.preview.clone();
        session.pending = Some(pending);
        Ok(preview)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn confirm_organization(
    plan_id: String,
    state: tauri::State<'_, SharedSession>,
    journals: tauri::State<'_, JournalDir>,
    control: tauri::State<'_, workflow::PackageControl>,
) -> Result<OrganizationResult, String> {
    if control.active.load(Ordering::SeqCst) {
        return Err("Wait for package collection to finish.".into());
    }
    let state = state.inner().clone();
    let journals = journals.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = state.lock().map_err(|e| e.to_string())?;
        let pending = session
            .pending
            .take()
            .ok_or("This preview has expired. Create a new preview.")?;
        if pending.preview.id != plan_id {
            return Err("This preview has expired. Create a new preview.".into());
        }
        let root = session.root.as_ref().ok_or("Open a project first.")?;
        execute(root, pending, &undo::journal_path(&journals, root))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_organization(state: tauri::State<'_, SharedSession>) -> Result<(), String> {
    state.lock().map_err(|e| e.to_string())?.pending = None;
    Ok(())
}
fn plan_id() -> String {
    format!(
        "{}-{}",
        now(),
        PLAN_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}
#[tauri::command]
async fn undo_status(
    state: tauri::State<'_, SharedSession>,
    journals: tauri::State<'_, JournalDir>,
) -> Result<Option<undo::UndoStatus>, String> {
    let root = state.lock().map_err(|e| e.to_string())?.root.clone();
    let journals = journals.0.clone();
    tauri::async_runtime::spawn_blocking(move || match root {
        Some(root) => undo::status(&undo::journal_path(&journals, &root), &root),
        None => Ok(None),
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn prepare_undo(
    state: tauri::State<'_, SharedSession>,
    journals: tauri::State<'_, JournalDir>,
) -> Result<undo::UndoPlan, String> {
    let state = state.inner().clone();
    let journals = journals.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = state.lock().map_err(|e| e.to_string())?;
        let root = session.root.as_ref().ok_or("Open a project first.")?;
        let pending = undo::prepare(&undo::journal_path(&journals, root), root, plan_id())?;
        let preview = pending.preview.clone();
        session.pending_package = None;
        session.pending_undo = Some(pending);
        Ok(preview)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn confirm_undo(
    plan_id: String,
    skip_conflicts: bool,
    state: tauri::State<'_, SharedSession>,
    control: tauri::State<'_, workflow::PackageControl>,
) -> Result<undo::UndoResult, String> {
    if control.active.load(Ordering::SeqCst) {
        return Err("Wait for package collection to finish.".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = state.lock().map_err(|e| e.to_string())?;
        let pending = session
            .pending_undo
            .take()
            .filter(|p| p.preview.id == plan_id)
            .ok_or("This undo preview has expired. Create a new preview.")?;
        undo::execute(
            session.root.as_ref().ok_or("Open a project first.")?,
            pending,
            skip_conflicts,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_undo(state: tauri::State<'_, SharedSession>) -> Result<(), String> {
    state.lock().map_err(|e| e.to_string())?.pending_undo = None;
    Ok(())
}
#[tauri::command]
fn reveal_asset(path: String, state: tauri::State<'_, SharedSession>) -> Result<(), String> {
    let session = state.lock().map_err(|e| e.to_string())?;
    let root = session.root.as_ref().ok_or("Open a project first.")?;
    let file = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !file.starts_with(root) {
        return Err("This file is outside the open project.".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .raw_arg(format!("/select,\"{}\"", display_path(&file)))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
async fn read_model_resource(
    model_path: String,
    resource: Option<String>,
    state: tauri::State<'_, SharedSession>,
) -> Result<tauri::ipc::Response, String> {
    let root = state
        .lock()
        .map_err(|e| e.to_string())?
        .root
        .clone()
        .ok_or("Open a project before inspecting a model.")?;
    tauri::async_runtime::spawn_blocking(move || {
        model::read_resource(&root, &PathBuf::from(model_path), resource.as_deref())
            .map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(Default)]
struct SavedSheet(Mutex<Option<PathBuf>>);

#[tauri::command]
async fn open_asset_with(
    path: String,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SharedSession>,
) -> Result<(), String> {
    let root = state
        .lock()
        .map_err(|e| e.to_string())?
        .root
        .clone()
        .ok_or("Open a project first.")?;
    #[cfg(windows)]
    let parent = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    tauri::async_runtime::spawn_blocking(move || {
        let file = asset_tools::project_file(&root, &path)?;
        #[cfg(windows)]
        {
            asset_tools::open_with(&file, parent)
        }
        #[cfg(not(windows))]
        {
            let _ = (file, window);
            Err("Open With is currently available on Windows.".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_technical_metadata(
    path: String,
    state: tauri::State<'_, SharedSession>,
) -> Result<asset_tools::TechnicalMetadata, String> {
    let root = state
        .lock()
        .map_err(|e| e.to_string())?
        .root
        .clone()
        .ok_or("Open a project first.")?;
    tauri::async_runtime::spawn_blocking(move || {
        asset_tools::technical_metadata(&asset_tools::project_file(&root, &path)?)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_contact_sheet(
    title: String,
    columns: usize,
    assets: Vec<asset_tools::SheetAsset>,
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedSession>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let root = state
        .lock()
        .map_err(|e| e.to_string())?
        .root
        .clone()
        .ok_or("Open a project first.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let html = asset_tools::contact_sheet(&root, &title, columns, &assets)?;
        let Some(tauri_plugin_dialog::FilePath::Path(mut path)) = app
            .dialog()
            .file()
            .set_title("Save contact sheet · existing files will not be overwritten")
            .set_file_name("AssetFlow-contact-sheet.html")
            .add_filter("Contact sheet (HTML)", &["html"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        if path.extension().is_none() {
            path.set_extension("html");
        }
        asset_tools::write_new_sheet(&path, &html)?;
        let displayed = display_path(&path);
        *app.state::<SavedSheet>()
            .0
            .lock()
            .map_err(|e| e.to_string())? = Some(path);
        Ok(Some(displayed))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_saved_contact_sheet(saved: tauri::State<'_, SavedSheet>) -> Result<(), String> {
    let path = saved
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Export a contact sheet first.")?;
    if !path.is_file() {
        return Err("The exported contact sheet is no longer available.".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteW(
                hwnd: isize,
                operation: *const u16,
                file: *const u16,
                parameters: *const u16,
                directory: *const u16,
                show: i32,
            ) -> isize;
        }
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                0,
                verb.as_ptr(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };
        if result <= 32 {
            return Err(format!(
                "Windows could not open the contact sheet (error {result})."
            ));
        }
    }
    Ok(())
}

#[derive(Default)]
struct WatchState(Mutex<Option<watcher::ProjectWatch>>);
#[derive(Default)]
struct LastPackage(Mutex<Option<PathBuf>>);
#[derive(serde::Serialize)]
struct WatchLease {
    id: u64,
    path: String,
    active: bool,
    error: Option<String>,
}

#[tauri::command]
async fn start_project_watch(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedSession>,
) -> Result<WatchLease, String> {
    let root = state
        .lock()
        .map_err(|e| e.to_string())?
        .root
        .clone()
        .ok_or("Open a project first.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<WatchState>();
        let mut current = store.0.lock().map_err(|e| e.to_string())?;
        drop(current.take());
        let id = PLAN_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = display_path(&root);
        let emitter = app.clone();
        match watcher::ProjectWatch::start(&root, id, move |event| {
            let _ = emitter.emit_to("main", "assetflow:project-change", event);
        }) {
            Ok(watch) => {
                *current = Some(watch);
                Ok(WatchLease {
                    id,
                    path,
                    active: true,
                    error: None,
                })
            }
            Err(error) => Ok(WatchLease {
                id,
                path,
                active: false,
                error: Some(error),
            }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn stop_project_watch(id: u64, app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<WatchState>();
        let mut watch = store.0.lock().map_err(|e| e.to_string())?;
        if watch.as_ref().is_some_and(|w| w.id == id) {
            drop(watch.take());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn refresh_project(
    expected_path: String,
    state: tauri::State<'_, SharedSession>,
) -> Result<Project, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = state.lock().map_err(|e| e.to_string())?;
        let root = session.root.as_ref().ok_or("Open a project first.")?;
        if display_path(root) != expected_path {
            return Err("The active project changed.".into());
        }
        if session.pending.is_some()
            || session.pending_undo.is_some()
            || session.pending_package.is_some()
        {
            return Err("Close the current preview before refreshing live assets.".into());
        }
        scan(root)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn close_project(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedSession>,
) -> Result<(), String> {
    if app
        .state::<workflow::PackageControl>()
        .active
        .load(Ordering::SeqCst)
    {
        return Err("Wait for package collection to finish.".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        *state.lock().map_err(|e| e.to_string())? = Session::default();
        drop(
            app.state::<WatchState>()
                .0
                .lock()
                .map_err(|e| e.to_string())?
                .take(),
        );
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn check_project_health(
    state: tauri::State<'_, SharedSession>,
) -> Result<workflow::HealthReport, String> {
    let root = state
        .lock()
        .map_err(|e| e.to_string())?
        .root
        .clone()
        .ok_or("Open a project first.")?;
    tauri::async_runtime::spawn_blocking(move || workflow::health(&root))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn prepare_package(
    paths: Vec<String>,
    state: tauri::State<'_, SharedSession>,
) -> Result<workflow::PackagePlan, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = state.lock().map_err(|e| e.to_string())?;
        if session.pending.is_some() || session.pending_undo.is_some() {
            return Err("Close the organization or undo preview first.".into());
        }
        let root = session.root.as_ref().ok_or("Open a project first.")?;
        let plan = workflow::prepare(root, paths, plan_id())?;
        let preview = plan.preview.clone();
        session.pending_package = Some(plan);
        Ok(preview)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_package_preview(
    plan_id: String,
    state: tauri::State<'_, SharedSession>,
) -> Result<(), String> {
    let mut session = state.lock().map_err(|e| e.to_string())?;
    if session
        .pending_package
        .as_ref()
        .is_some_and(|p| p.preview.id == plan_id)
    {
        session.pending_package = None;
    }
    Ok(())
}
#[tauri::command]
fn cancel_package(app: tauri::AppHandle) {
    app.state::<workflow::PackageControl>()
        .cancel
        .store(true, Ordering::SeqCst);
}
#[tauri::command]
async fn confirm_package(
    plan_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedSession>,
) -> Result<Option<workflow::PackageResult>, String> {
    use tauri_plugin_dialog::DialogExt;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let control = app.state::<workflow::PackageControl>();
        let _active = control.begin()?;
        let pending = state
            .lock()
            .map_err(|e| e.to_string())?
            .pending_package
            .take()
            .filter(|p| p.preview.id == plan_id)
            .ok_or("Package preview expired. Review a new preview.")?;
        if !pending.preview.issues.is_empty() {
            return Err("Resolve the dependency issues before collecting this package.".into());
        }
        let Some(tauri_plugin_dialog::FilePath::Path(parent)) = app
            .dialog()
            .file()
            .set_title("Choose a package destination outside the source project")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let result = workflow::collect(pending, &parent, &control, |progress| {
            let _ = app.emit_to("main", "assetflow:package-progress", progress);
        })?;
        *app.state::<LastPackage>()
            .0
            .lock()
            .map_err(|e| e.to_string())? = Some(PathBuf::from(&result.path));
        Ok(Some(result))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn open_package_folder(app: tauri::AppHandle) -> Result<(), String> {
    let path = app
        .state::<LastPackage>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Collect a package first.")?;
    if !path.is_dir() {
        return Err("The package folder is no longer available.".into());
    }
    std::process::Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SharedSession::default())
        .manage(SavedSheet::default())
        .manage(WatchState::default())
        .manage(LastPackage::default())
        .manage(workflow::PackageControl::default())
        .setup(|app| {
            app.manage(JournalDir(
                app.path().app_local_data_dir()?.join("organization-journals"),
            ));
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_web_resource_request(|request, response| {
                    if request.uri().path() == "/decoders/basis/worker.js" {
                        // The bundled Emscripten decoder uses Function constructors. Only this
                        // isolated worker permits them; it has no network access or Tauri bridge.
                        response.headers_mut().insert(
                            tauri::http::header::CONTENT_SECURITY_POLICY,
                            "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'none'; worker-src 'none'".parse().unwrap(),
                        );
                    }
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_project,
            prepare_organization,
            confirm_organization,
            cancel_organization,
            undo_status,
            prepare_undo,
            confirm_undo,
            cancel_undo,
            reveal_asset,
            read_model_resource,
            open_asset_with,
            read_technical_metadata,
            export_contact_sheet,
            open_saved_contact_sheet,
            start_project_watch, stop_project_watch, refresh_project, close_project,
            check_project_health, prepare_package, cancel_package_preview, cancel_package, confirm_package, open_package_folder
        ])
        .run(tauri::generate_context!())
        .expect("Could not start AssetFlow");
}
