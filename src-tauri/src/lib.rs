mod config;
mod keycodes;
mod models;
mod service;
mod storage;
mod telemetry;
mod via;

use models::{AppSettings, DeviceState, LayoutData};
use service::DeviceService;
use std::process::Command;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;

struct SettingsState(Mutex<AppSettings>);

#[tauri::command]
fn get_layout() -> Result<LayoutData, String> {
    config::load_layout()
}

#[tauri::command]
fn get_initial_state(service: tauri::State<DeviceService>) -> DeviceState {
    service.state()
}

#[tauri::command]
fn refresh_keymap(service: tauri::State<DeviceService>) -> Result<(), String> {
    service.refresh()
}

#[tauri::command]
fn get_settings(state: tauri::State<SettingsState>) -> AppSettings {
    state
        .0
        .lock()
        .map(|settings| settings.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn update_settings(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<SettingsState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let settings = settings.normalized();
    let launch_changed = state
        .0
        .lock()
        .map_err(|_| "设置状态锁已损坏".to_string())?
        .launch_at_login
        != settings.launch_at_login;
    apply_window_settings(&window, &settings)?;
    if launch_changed {
        sync_autostart(&app, settings.launch_at_login)?;
    }
    storage::save_settings(&settings)?;
    *state.0.lock().map_err(|_| "设置状态锁已损坏".to_string())? = settings.clone();
    let _ = app.emit("settings-changed", &settings);
    Ok(settings)
}

#[tauri::command]
fn unlock_window(app: tauri::AppHandle) -> Result<AppSettings, String> {
    unlock_window_impl(&app)
}

fn unlock_window_impl(app: &tauri::AppHandle) -> Result<AppSettings, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let state = app.state::<SettingsState>();
    let mut settings = state.0.lock().map_err(|_| "设置状态锁已损坏".to_string())?;
    settings.click_through = false;
    window
        .set_ignore_cursor_events(false)
        .map_err(|error| error.to_string())?;
    storage::save_settings(&settings)?;
    let result = settings.clone();
    let _ = app.emit("settings-changed", &result);
    Ok(result)
}

fn restore_interactive_window(app: &tauri::AppHandle) -> Result<(), String> {
    unlock_window_impl(app)?;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    if window.is_minimized().map_err(|error| error.to_string())? {
        window.unminimize().map_err(|error| error.to_string())?;
    }
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_repository() -> Result<(), String> {
    const URL: &str = "https://github.com/hwangzhun/via-echo";
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd").args(["/C", "start", "", URL]).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(URL).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(URL).spawn();

    result
        .map(|_| ())
        .map_err(|error| format!("无法打开 GitHub 仓库：{error}"))
}

fn apply_window_settings(
    window: &tauri::WebviewWindow,
    settings: &AppSettings,
) -> Result<(), String> {
    window
        .set_always_on_top(settings.always_on_top)
        .map_err(|error| error.to_string())?;
    window
        .set_ignore_cursor_events(settings.click_through)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn sync_autostart(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())
    } else {
        manager.disable().map_err(|error| error.to_string())
    }
}

pub fn run() {
    let initial_device_state = storage::load_cached_state().unwrap_or_default();
    let initial_settings = storage::load_settings();
    let setup_settings = initial_settings.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(SettingsState(Mutex::new(initial_settings)))
        .on_menu_event(|app, event| {
            // Handle the emergency unlock natively. A click-through window must
            // not rely solely on its WebView/JavaScript callback to become
            // interactive again.
            if event.id().as_ref() == "unlock" {
                if let Err(message) = restore_interactive_window(app) {
                    eprintln!("解除鼠标穿透失败：{message}");
                }
            }
        })
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                apply_window_settings(&window, &setup_settings)?;
            }
            app.manage(DeviceService::spawn(
                app.handle().clone(),
                initial_device_state,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_layout,
            get_initial_state,
            refresh_keymap,
            get_settings,
            update_settings,
            unlock_window,
            open_repository,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VIA Echo");
}
