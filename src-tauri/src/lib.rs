mod filesystem;
mod model;
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
use tauri::Manager;

#[derive(Default)]
struct Session {
    root: Option<PathBuf>,
    pending: Option<PendingPlan>,
}
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
        let pending = prepare(
            root,
            format!(
                "{}-{}",
                now(),
                PLAN_SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ),
        )?;
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
) -> Result<OrganizationResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = state.lock().map_err(|e| e.to_string())?;
        let pending = session
            .pending
            .take()
            .ok_or("This preview has expired. Create a new preview.")?;
        if pending.preview.id != plan_id {
            return Err("This preview has expired. Create a new preview.".into());
        }
        execute(
            session.root.as_ref().ok_or("Open a project first.")?,
            pending,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_organization(state: tauri::State<'_, SharedSession>) -> Result<(), String> {
    state.lock().map_err(|e| e.to_string())?.pending = None;
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
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SharedSession::default())
        .setup(|app| {
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
            reveal_asset,
            read_model_resource
        ])
        .run(tauri::generate_context!())
        .expect("Could not start AssetFlow");
}
