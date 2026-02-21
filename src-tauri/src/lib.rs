mod config;
mod key_listener;
mod keymap;

use config::{parse_layout, ParsedLayout};
use key_listener::{set_current_layer, spawn_key_listener};
use keymap::scan_for_keyboard;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::Manager;

const DEFAULT_VID: u16 = 0xD010;
const DEFAULT_PID: u16 = 0x1202;
const DEFAULT_USAGE_PAGE: u16 = 0xFF60;

fn resource_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
}

fn load_layout_json() -> Result<ParsedLayout, String> {
    let path = resource_path().join("kb12-02.json");
    let s = fs::read_to_string(&path).map_err(|e| format!("读取布局文件失败: {}: {}", path.display(), e))?;
    parse_layout(&s)
}

#[tauri::command]
fn get_layout() -> Result<LayoutPayload, String> {
    let parsed = load_layout_json()?;
    Ok(LayoutPayload {
        name: parsed.name,
        rows: parsed.rows,
        cols: parsed.cols,
        width: parsed.width,
        height: parsed.height,
        keys: parsed
            .keys
            .into_iter()
            .map(|k| KeyRectPayload {
                row: k.row,
                col: k.col,
                x: k.x,
                y: k.y,
                w: k.w,
                h: k.h,
            })
            .collect(),
        encoders: parsed
            .encoders
            .into_iter()
            .map(|e| EncoderRectPayload {
                id: e.id,
                row: e.row,
                col: e.col,
                x: e.x,
                y: e.y,
                w: e.w,
                h: e.h,
            })
            .collect(),
    })
}

#[derive(serde::Serialize)]
struct LayoutPayload {
    name: String,
    rows: u8,
    cols: u8,
    width: f64,
    height: f64,
    keys: Vec<KeyRectPayload>,
    encoders: Vec<EncoderRectPayload>,
}

#[derive(serde::Serialize)]
struct KeyRectPayload {
    row: u8,
    col: u8,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(serde::Serialize)]
struct EncoderRectPayload {
    id: String,
    row: u8,
    col: u8,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct KeymapState(Arc<Mutex<Option<(Vec<Vec<u16>>, u8, u8)>>>);

#[tauri::command]
fn load_keymap_from_keyboard(
    state: tauri::State<KeymapState>,
) -> Result<Option<KeymapPayload>, String> {
    let (vid, pid, usage_page) = scan_for_keyboard(Some(DEFAULT_VID), Some(DEFAULT_PID))
        .or_else(|| Some((DEFAULT_VID, DEFAULT_PID, DEFAULT_USAGE_PAGE)))
        .ok_or("未找到 VIA 键盘")?;

    let rows = 4u8;
    let cols = 5u8;

    let result = keymap::load_keymap_from_keyboard(vid, pid, usage_page, rows, cols)?;
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some((result.raw.clone(), rows, cols));
    }
    if let Err(e) = save_keymap_cache(&result) {
        eprintln!("缓存键位失败: {}", e);
    }
    Ok(Some(KeymapPayload {
        layers: result.display.layers,
        rows: result.display.rows,
        cols: result.display.cols,
    }))
}

#[tauri::command]
fn load_keymap_from_cache(state: tauri::State<KeymapState>) -> Result<Option<KeymapPayload>, String> {
    let result = keymap::load_keymap_cache().map_err(|e| e.to_string())?;
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some((result.raw, result.display.rows, result.display.cols));
    }
    Ok(Some(KeymapPayload {
        layers: result.display.layers,
        rows: result.display.rows,
        cols: result.display.cols,
    }))
}

fn save_keymap_cache(result: &keymap::KeymapLoadResult) -> Result<(), Box<dyn std::error::Error>> {
    let cache_dir = dirs::cache_dir().ok_or("无法获取缓存目录")?;
    let dir = cache_dir.join("via-hub");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("keymap.json");
    let cache = KeymapCache {
        layers_display: result.display.layers.clone(),
        layers_raw: result.raw.clone(),
        rows: result.display.rows,
        cols: result.display.cols,
    };
    let s = serde_json::to_string_pretty(&cache)?;
    std::fs::write(path, s)?;
    Ok(())
}

#[derive(serde::Serialize)]
struct KeymapPayload {
    layers: Vec<Vec<String>>,
    rows: u8,
    cols: u8,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct KeymapCache {
    layers_display: Vec<Vec<String>>,
    layers_raw: Vec<Vec<u16>>,
    rows: u8,
    cols: u8,
}

#[tauri::command]
fn set_layer(layer: u8) {
    set_current_layer(layer);
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    let keymap_state: Arc<Mutex<Option<(Vec<Vec<u16>>, u8, u8)>>> = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(KeymapState(Arc::clone(&keymap_state)))
        .setup(|app| {
            let handle = app.handle().clone();
            let arc = app.try_state::<KeymapState>().map(|s| Arc::clone(&s.0)).expect("KeymapState");
            spawn_key_listener(handle, arc);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_layout,
            load_keymap_from_keyboard,
            load_keymap_from_cache,
            set_layer,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
