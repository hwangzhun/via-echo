mod config;
mod keycodes;
mod models;
mod service;
mod storage;
mod telemetry;
mod via;

use models::{AppSettings, DeviceState, InputState, LayoutData, RefreshState, SettingsPatch};
use service::DeviceService;
use std::process::Command;
use std::sync::Mutex;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_window_state::{StateFlags, WindowExt};

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
fn get_input_state(service: tauri::State<DeviceService>) -> InputState {
    service.input_state()
}

#[tauri::command]
fn get_refresh_state(service: tauri::State<DeviceService>) -> RefreshState {
    service.refresh_state()
}

#[tauri::command]
fn update_settings(
    app: tauri::AppHandle,
    state: tauri::State<SettingsState>,
    patch: SettingsPatch,
) -> Result<AppSettings, String> {
    // Hold the lock across merge, side effects, persistence and publication.
    let mut current = state.0.lock().map_err(|_| "设置状态锁已损坏".to_string())?;
    let next = patch.apply(&current);
    let window = app.get_webview_window("main").ok_or("找不到悬浮窗")?;
    let result = (|| {
        apply_window_settings(&window, &next)?;
        if current.launch_at_login != next.launch_at_login {
            sync_autostart(&app, next.launch_at_login)?;
        }
        storage::save_settings(&next)
    })();
    if let Err(error) = result {
        let _ = apply_window_settings(&window, &current);
        if current.launch_at_login != next.launch_at_login {
            let _ = sync_autostart(&app, current.launch_at_login);
        }
        return Err(error);
    }
    *current = next.clone();
    let _ = app.emit("settings-changed", &next);
    Ok(next)
}

#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    show_window(&app, "settings")
}

fn show_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let window = app.get_webview_window(label).ok_or("找不到窗口")?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
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
    // Unlock must still work when persistence fails.
    window
        .set_ignore_cursor_events(false)
        .map_err(|error| error.to_string())?;
    settings.click_through = false;
    if let Err(error) = storage::save_settings(&settings) {
        eprintln!("解除穿透后保存设置失败：{error}");
    }
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

fn toggle_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("找不到悬浮窗")?;
    if window.is_visible().map_err(|e| e.to_string())?
        && !window.is_minimized().map_err(|e| e.to_string())?
    {
        window.hide().map_err(|e| e.to_string())
    } else {
        restore_interactive_window(app)
    }
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

fn ensure_window_min_size(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let Some(config) = window
        .app_handle()
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == window.label())
    else {
        return Ok(());
    };
    // Old saved sizes may predate the current minimum. Compare logical pixels for HiDPI.
    let size = window
        .inner_size()?
        .to_logical::<f64>(window.scale_factor()?);
    let width = size.width.max(config.min_width.unwrap_or(0.0));
    let height = size.height.max(config.min_height.unwrap_or(0.0));
    if width > size.width || height > size.height {
        window.set_size(tauri::LogicalSize::new(width, height))?;
    }
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
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION)
                .skip_initial_state("main")
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(SettingsState(Mutex::new(initial_settings)))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "main" {
                    window.app_handle().exit(0);
                } else if let Err(error) =
                    window.emit_to("settings", "settings-close-requested", ())
                {
                    eprintln!("无法请求关闭配置窗：{error}");
                }
            }
        })
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                // Restore first so a deferred plugin callback cannot override the minimum.
                if let Err(error) = window.restore_state(StateFlags::SIZE | StateFlags::POSITION) {
                    eprintln!("无法恢复悬浮窗位置与尺寸：{error}");
                }
                ensure_window_min_size(&window)?;
                apply_window_settings(&window, &setup_settings)?;
            }
            app.manage(DeviceService::spawn(
                app.handle().clone(),
                initial_device_state,
            ));
            let menu = MenuBuilder::new(app)
                .text("toggle", "显示 / 隐藏悬浮窗")
                .text("unlock", "解除鼠标穿透")
                .text("settings", "打开配置")
                .text("refresh", "刷新 VIA 键位")
                .separator()
                .text("quit", "退出 viaecho")
                .build()?;
            let mut tray = TrayIconBuilder::with_id("via-echo-tray")
                .menu(&menu)
                .tooltip("viaecho · DOIO KB16")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let result = match event.id().as_ref() {
                        "toggle" => toggle_overlay(app),
                        "unlock" => restore_interactive_window(app),
                        "settings" => show_window(app, "settings"),
                        "refresh" => app.state::<DeviceService>().refresh(),
                        "quit" => {
                            app.exit(0);
                            Ok(())
                        }
                        _ => Ok(()),
                    };
                    if let Err(error) = result {
                        eprintln!("托盘操作失败：{error}");
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        if let Err(error) = restore_interactive_window(tray.app_handle()) {
                            eprintln!("恢复悬浮窗失败：{error}");
                        }
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_layout,
            get_initial_state,
            refresh_keymap,
            get_settings,
            get_refresh_state,
            get_input_state,
            open_settings,
            update_settings,
            unlock_window,
            open_repository,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running viaecho");
}
