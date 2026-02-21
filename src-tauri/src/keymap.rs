use qmk_via_api::api::{KeyboardApi, MatrixInfo};
use qmk_via_api::keycodes::Keycode;
use qmk_via_api::scan::scan_keyboards;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct KeymapData {
    pub layers: Vec<Vec<String>>,
    pub rows: u8,
    pub cols: u8,
}

fn keycode_u16_to_name(code: u16) -> String {
    if code == 0 {
        return "KC_NO".to_string();
    }
    match Keycode::try_from(code) {
        Ok(kc) => format!("{:?}", kc),
        Err(_) => format!("0x{:04X}", code),
    }
}

pub struct KeymapLoadResult {
    pub display: KeymapData,
    pub raw: Vec<Vec<u16>>,
}

pub fn load_keymap_from_keyboard(
    vendor_id: u16,
    product_id: u16,
    usage_page: u16,
    rows: u8,
    cols: u8,
) -> Result<KeymapLoadResult, String> {
    let api = KeyboardApi::new(vendor_id, product_id, usage_page)
        .map_err(|e| format!("打开键盘失败: {:?}", e))?;

    let layer_count = api.get_layer_count().map_err(|e| format!("读取层数失败: {:?}", e))?;
    let matrix = MatrixInfo { rows, cols };

    let mut layers_display = Vec::with_capacity(layer_count as usize);
    let mut layers_raw = Vec::with_capacity(layer_count as usize);
    for layer in 0..layer_count {
        let raw = api
            .read_raw_matrix(matrix, layer)
            .map_err(|e| format!("读取 layer {} 失败: {:?}", layer, e))?;
        let names: Vec<String> = raw.iter().map(|&c| keycode_u16_to_name(c)).collect();
        layers_raw.push(raw);
        layers_display.push(names);
    }

    Ok(KeymapLoadResult {
        display: KeymapData {
            layers: layers_display,
            rows,
            cols,
        },
        raw: layers_raw,
    })
}

#[derive(Deserialize)]
struct KeymapCacheFile {
    layers_display: Vec<Vec<String>>,
    layers_raw: Vec<Vec<u16>>,
    rows: u8,
    cols: u8,
}

pub fn load_keymap_cache() -> Result<KeymapLoadResult, Box<dyn std::error::Error>> {
    let cache_dir = dirs::cache_dir().ok_or("无法获取缓存目录")?;
    let path = cache_dir.join("via-hub").join("keymap.json");
    let s = std::fs::read_to_string(path)?;
    let cache: KeymapCacheFile = serde_json::from_str(&s)?;
    Ok(KeymapLoadResult {
        display: KeymapData {
            layers: cache.layers_display,
            rows: cache.rows,
            cols: cache.cols,
        },
        raw: cache.layers_raw,
    })
}

pub fn scan_for_keyboard(
    vendor_id: Option<u16>,
    product_id: Option<u16>,
) -> Option<(u16, u16, u16)> {
    let devices = scan_keyboards();
    for dev in devices {
        if let (Some(v), Some(p)) = (vendor_id, product_id) {
            if dev.vendor_id == v && dev.product_id == p {
                return Some((dev.vendor_id, dev.product_id, dev.usage_page));
            }
        } else {
            return Some((dev.vendor_id, dev.product_id, dev.usage_page));
        }
    }
    None
}
