use crate::models::{LayoutData, MATRIX_COLS, MATRIX_ROWS};

const LAYOUT_JSON: &str = include_str!("../resources/kb16-01.json");

pub fn load_layout() -> Result<LayoutData, String> {
    let layout: LayoutData = serde_json::from_str(LAYOUT_JSON)
        .map_err(|error| format!("布局 JSON 解析失败: {error}"))?;
    validate_layout(&layout)?;
    Ok(layout)
}

fn validate_layout(layout: &LayoutData) -> Result<(), String> {
    if layout.rows != MATRIX_ROWS || layout.cols != MATRIX_COLS {
        return Err(format!("布局矩阵应为 {MATRIX_ROWS}×{MATRIX_COLS}"));
    }
    if layout.keys.len() != 16 || layout.encoders.len() != 3 {
        return Err("布局必须包含 16 个普通键和 3 个旋钮".into());
    }
    let mut positions = std::collections::HashSet::new();
    for key in &layout.keys {
        if key.row >= MATRIX_ROWS || key.col >= 4 || !positions.insert((key.row, key.col)) {
            return Err("普通键矩阵位置无效或重复".into());
        }
    }
    for encoder in &layout.encoders {
        if encoder.row >= 3 || encoder.col != 4 || !positions.insert((encoder.row, encoder.col)) {
            return Err("旋钮按压矩阵位置无效或重复".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_layout_is_complete() {
        let layout = load_layout().unwrap();
        assert_eq!(layout.keys.len(), 16);
        assert_eq!(layout.encoders.len(), 3);
        assert_eq!(layout.rows, 4);
        assert_eq!(layout.cols, 5);
    }
}
