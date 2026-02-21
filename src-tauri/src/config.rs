use serde::Deserialize;
use std::collections::HashMap;

const KEY_UNIT_PX: f64 = 56.0;

#[derive(Debug, Deserialize)]
pub struct ViaKeyboardJson {
    pub name: Option<String>,
    #[serde(rename = "vendorId")]
    pub vendor_id: Option<String>,
    #[serde(rename = "productId")]
    pub product_id: Option<String>,
    pub matrix: Option<Matrix>,
    pub layouts: Option<Layouts>,
}

#[derive(Debug, Deserialize)]
pub struct Matrix {
    pub rows: u8,
    pub cols: u8,
}

#[derive(Debug, Deserialize)]
pub struct Layouts {
    pub keymap: Option<KeymapLayout>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum KeymapLayout {
    Rows(Vec<Vec<KleCell>>),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum KleCell {
    Obj(HashMap<String, serde_json::Value>),
    Str(String),
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct KeyRect {
    pub row: u8,
    pub col: u8,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EncoderRect {
    pub id: String,
    pub row: u8,
    pub col: u8,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ParsedLayout {
    pub name: String,
    pub rows: u8,
    pub cols: u8,
    pub width: f64,
    pub height: f64,
    pub keys: Vec<KeyRect>,
    pub encoders: Vec<EncoderRect>,
}

pub fn parse_layout(json_str: &str) -> Result<ParsedLayout, String> {
    let root: ViaKeyboardJson =
        serde_json::from_str(json_str).map_err(|e| format!("JSON 解析失败: {}", e))?;

    let name = root.name.unwrap_or_else(|| "KB12-02".to_string());
    let matrix = root.matrix.ok_or("缺少 matrix")?;
    let keymap_rows = root
        .layouts
        .and_then(|l| l.keymap)
        .and_then(|k| match k {
            KeymapLayout::Rows(r) => Some(r),
        })
        .ok_or("缺少 layouts.keymap")?;

    let mut keys = Vec::new();
    let mut encoders = Vec::new();
    let mut layout_x_max = 0.0f64;
    let mut layout_y_max = 0.0f64;

    let mut current_x = 0.0f64;
    let mut current_y = 0.0f64;
    let mut default_w = 1.0f64;
    let mut default_h = 1.0f64;

    for row_cells in keymap_rows {
        current_x = 0.0;
        for cell in row_cells {
            match cell {
                KleCell::Obj(ref obj) => {
                    if let Some(v) = obj.get("x").and_then(|v| v.as_f64()) {
                        current_x += v;
                    }
                    if let Some(v) = obj.get("y").and_then(|v| v.as_f64()) {
                        current_y += v;
                    }
                    if let Some(v) = obj.get("w").and_then(|v| v.as_f64()) {
                        default_w = v;
                    }
                    if let Some(v) = obj.get("h").and_then(|v| v.as_f64()) {
                        default_h = v;
                    }
                }
                KleCell::Str(ref s) => {
                    let first_line = s.lines().next().unwrap_or(s).trim();
                    let is_encoder = s.contains("e0") || s.contains("e1") || s.contains("e2");
                    let encoder_id = if s.contains("e2") {
                        "e2"
                    } else if s.contains("e1") {
                        "e1"
                    } else if s.contains("e0") {
                        "e0"
                    } else {
                        ""
                    };

                    if is_encoder && !encoder_id.is_empty() {
                        let parts: Vec<&str> = first_line.split(',').collect();
                        let row = parts.get(0).and_then(|x| x.trim().parse().ok()).unwrap_or(0);
                        let col = parts.get(1).and_then(|x| x.trim().parse().ok()).unwrap_or(0);
                        let w = default_w;
                        let h = default_h;
                        encoders.push(EncoderRect {
                            id: encoder_id.to_string(),
                            row,
                            col,
                            x: current_x * KEY_UNIT_PX,
                            y: current_y * KEY_UNIT_PX,
                            w: w * KEY_UNIT_PX,
                            h: h * KEY_UNIT_PX,
                        });
                        layout_x_max = layout_x_max.max(current_x + w);
                        layout_y_max = layout_y_max.max(current_y + h);
                        current_x += w;
                    } else if first_line.contains(',') {
                        let parts: Vec<&str> = first_line.split(',').collect();
                        let row = parts.get(0).and_then(|x| x.trim().parse().ok()).unwrap_or(0);
                        let col = parts.get(1).and_then(|x| x.trim().parse().ok()).unwrap_or(0);
                        let w = default_w;
                        let h = default_h;
                        keys.push(KeyRect {
                            row,
                            col,
                            x: current_x * KEY_UNIT_PX,
                            y: current_y * KEY_UNIT_PX,
                            w: w * KEY_UNIT_PX,
                            h: h * KEY_UNIT_PX,
                        });
                        layout_x_max = layout_x_max.max(current_x + w);
                        layout_y_max = layout_y_max.max(current_y + h);
                        current_x += w;
                    }
                    default_w = 1.0;
                    default_h = 1.0;
                }
            }
        }
        current_y += 1.0;
    }

    let width = (layout_x_max * KEY_UNIT_PX).ceil();
    let height = (layout_y_max * KEY_UNIT_PX).ceil();

    Ok(ParsedLayout {
        name,
        rows: matrix.rows,
        cols: matrix.cols,
        width,
        height,
        keys,
        encoders,
    })
}
