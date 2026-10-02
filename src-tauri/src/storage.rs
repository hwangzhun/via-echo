use crate::models::{
    AppSettings, DeviceState, DeviceStatus, EncoderBinding, KeyBinding, CACHE_VERSION, DEVICE_PID,
    DEVICE_VID,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeymapCache {
    version: u8,
    vendor_id: u16,
    product_id: u16,
    cached_at: u64,
    layers: Vec<Vec<KeyBinding>>,
    encoders: Vec<Vec<EncoderBinding>>,
}

fn cache_path() -> Result<PathBuf, String> {
    let root = dirs::cache_dir().ok_or_else(|| "无法获取系统缓存目录".to_string())?;
    Ok(root.join("via-echo").join("keymap-v1.json"))
}

fn settings_path() -> Result<PathBuf, String> {
    let root = dirs::config_dir().ok_or_else(|| "无法获取系统配置目录".to_string())?;
    Ok(root.join("via-echo").join("settings.json"))
}

pub fn load_cached_state() -> Option<DeviceState> {
    load_cache_at(&cache_path().ok()?).ok()
}

fn load_cache_at(path: &Path) -> Result<DeviceState, String> {
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let cache: KeymapCache = serde_json::from_str(&text).map_err(|error| error.to_string())?;
    if cache.version != CACHE_VERSION
        || cache.vendor_id != DEVICE_VID
        || cache.product_id != DEVICE_PID
        || cache.layers.len() != 4
        || cache.encoders.len() != 4
    {
        return Err("缓存版本或设备不匹配".into());
    }
    Ok(DeviceState {
        status: DeviceStatus::Offline,
        active_layer: 0,
        layers: cache.layers,
        encoders: cache.encoders,
        cached_at: Some(cache.cached_at),
        message: Some("已显示上次连接的键位".into()),
    })
}

pub fn save_cached_state(state: &DeviceState) -> Result<u64, String> {
    let cached_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let cache = KeymapCache {
        version: CACHE_VERSION,
        vendor_id: DEVICE_VID,
        product_id: DEVICE_PID,
        cached_at,
        layers: state.layers.clone(),
        encoders: state.encoders.clone(),
    };
    let path = cache_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(&cache).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())?;
    Ok(cached_at)
}

pub fn load_settings() -> AppSettings {
    let mut settings = settings_path()
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<AppSettings>(&text).ok())
        .unwrap_or_default()
        .normalized();
    // Mouse passthrough is useful while the app is running, but persisting it
    // across launches can leave the entire window impossible to operate.
    settings.click_through = false;
    settings
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(&settings.clone().normalized())
        .map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_wrong_device_cache() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("cache.json");
        fs::write(
            &path,
            r#"{"version":1,"vendorId":1,"productId":2,"cachedAt":1,"layers":[[],[],[],[]],"encoders":[[],[],[],[]]}"#,
        )
        .unwrap();
        assert!(load_cache_at(&path).is_err());
    }

    #[test]
    fn rejects_corrupt_cache() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("cache.json");
        fs::write(&path, "not-json").unwrap();
        assert!(load_cache_at(&path).is_err());
    }
}
