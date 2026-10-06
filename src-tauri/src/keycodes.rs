use crate::models::KeyBinding;

pub fn binding_from_code(code: u16) -> KeyBinding {
    let (qmk_name, display_label, icon) = describe(code);
    KeyBinding {
        raw_code: code,
        qmk_name,
        display_label,
        icon,
    }
}

fn describe(code: u16) -> (String, String, Option<String>) {
    if (0x0004..=0x001D).contains(&code) {
        let letter = char::from(b'A' + (code - 0x0004) as u8).to_string();
        return (format!("KC_{letter}"), letter, None);
    }
    if (0x001E..=0x0027).contains(&code) {
        let digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
        let digit = digits[(code - 0x001E) as usize].to_string();
        return (format!("KC_{digit}"), digit, None);
    }
    if (0x003A..=0x0045).contains(&code) {
        let number = code - 0x003A + 1;
        return (format!("KC_F{number}"), format!("F{number}"), None);
    }

    if (0x0100..=0x1FFF).contains(&code) {
        let base = code & 0x00FF;
        let mods = ((code >> 8) & 0x1F) as u8;
        let (_, base_label, _) = describe(base);
        let mut labels = Vec::new();
        if mods & 0x01 != 0 {
            labels.push("Ctrl");
        }
        if mods & 0x02 != 0 {
            labels.push("Shift");
        }
        if mods & 0x04 != 0 {
            labels.push("Alt");
        }
        if mods & 0x08 != 0 {
            labels.push("Win");
        }
        labels.push(&base_label);
        return (
            format!("MODS(0x{mods:02X}, 0x{base:02X})"),
            labels.join("+"),
            None,
        );
    }
    if (0x2000..=0x3FFF).contains(&code) {
        let base = code & 0x00FF;
        let (_, base_label, _) = describe(base);
        return (
            format!("MT(0x{code:04X})"),
            format!("点按 {base_label}"),
            Some("⇧".into()),
        );
    }
    if (0x4000..=0x4FFF).contains(&code) {
        let layer = (code >> 8) & 0x0F;
        let base = code & 0x00FF;
        let (_, base_label, _) = describe(base);
        return (
            format!("LT({layer},0x{base:02X})"),
            format!("L{} / {base_label}", layer + 1),
            Some("◈".into()),
        );
    }

    for (start, end, name, label) in [
        (0x5200, 0x521F, "TO", "跳至"),
        (0x5220, 0x523F, "MO", "按住"),
        (0x5240, 0x525F, "DF", "默认"),
        (0x5260, 0x527F, "TG", "切换"),
        (0x5280, 0x529F, "OSL", "单次"),
        (0x52C0, 0x52DF, "TT", "层轻触"),
    ] {
        if (start..=end).contains(&code) {
            let layer = code - start;
            return (
                format!("{name}({layer})"),
                format!("{label} L{}", layer + 1),
                Some("◈".into()),
            );
        }
    }

    if (0x7700..=0x777F).contains(&code) {
        let id = code - 0x7700;
        return (
            format!("MACRO({id})"),
            format!("宏 M{id}"),
            Some("◇".into()),
        );
    }

    let item = match code {
        0x0000 => ("KC_NO", "未设置", None),
        0x0001 => ("KC_TRNS", "透明", Some("↓")),
        0x0028 => ("KC_ENT", "Enter", Some("↵")),
        0x0029 => ("KC_ESC", "Esc", None),
        0x002A => ("KC_BSPC", "退格", Some("⌫")),
        0x002B => ("KC_TAB", "Tab", Some("⇥")),
        0x002C => ("KC_SPC", "空格", Some("␣")),
        0x002D => ("KC_MINS", "-", None),
        0x002E => ("KC_EQL", "=", None),
        0x002F => ("KC_LBRC", "[", None),
        0x0030 => ("KC_RBRC", "]", None),
        0x0031 => ("KC_BSLS", "\\", None),
        0x0033 => ("KC_SCLN", ";", None),
        0x0034 => ("KC_QUOT", "'", None),
        0x0035 => ("KC_GRV", "`", None),
        0x0036 => ("KC_COMM", ",", None),
        0x0037 => ("KC_DOT", ".", None),
        0x0038 => ("KC_SLSH", "/", None),
        0x0049 => ("KC_INS", "Insert", None),
        0x004A => ("KC_HOME", "Home", None),
        0x004B => ("KC_PGUP", "Page Up", Some("⇞")),
        0x004C => ("KC_DEL", "Delete", Some("⌦")),
        0x004D => ("KC_END", "End", None),
        0x004E => ("KC_PGDN", "Page Down", Some("⇟")),
        0x004F => ("KC_RGHT", "右", Some("→")),
        0x0050 => ("KC_LEFT", "左", Some("←")),
        0x0051 => ("KC_DOWN", "下", Some("↓")),
        0x0052 => ("KC_UP", "上", Some("↑")),
        // Keep media bindings as text. Emoji glyphs vary by platform and can
        // become colored artwork that clashes with the keycap typography.
        0x00A8 => ("KC_MUTE", "静音", None),
        0x00A9 => ("KC_VOLU", "音量 +", None),
        0x00AA => ("KC_VOLD", "音量 -", None),
        0x00AB => ("KC_MNXT", "下一曲", None),
        0x00AC => ("KC_MPRV", "上一曲", None),
        0x00AD => ("KC_MSTP", "停止", None),
        0x00AE => ("KC_MPLY", "播放/暂停", None),
        0x00CD => ("KC_MS_U", "鼠标上", Some("↑")),
        0x00CE => ("KC_MS_D", "鼠标下", Some("↓")),
        0x00CF => ("KC_MS_L", "鼠标左", Some("←")),
        0x00D0 => ("KC_MS_R", "鼠标右", Some("→")),
        0x00D9 => ("KC_WH_U", "滚轮上", Some("↑")),
        0x00DA => ("KC_WH_D", "滚轮下", Some("↓")),
        0x7842 => ("RM_TOGG", "RGB 开关", Some("◉")),
        0x7843 => ("RM_NEXT", "RGB 效果", Some("◉")),
        0x7845 => ("RM_HUEU", "色相 +", Some("◉")),
        0x7846 => ("RM_HUED", "色相 -", Some("◉")),
        0x7847 => ("RM_SATU", "饱和 +", Some("◉")),
        0x7848 => ("RM_SATD", "饱和 -", Some("◉")),
        0x7849 => ("RM_VALU", "亮度 +", None),
        0x784A => ("RM_VALD", "亮度 -", None),
        0x784B => ("RM_SPDU", "速度 +", Some("◉")),
        0x784C => ("RM_SPDD", "速度 -", Some("◉")),
        0x7C00 => ("QK_BOOT", "刷写模式", None),
        _ => return (format!("0x{code:04X}"), "未知".into(), Some("?".into())),
    };
    (item.0.into(), item.1.into(), item.2.map(str::to_owned))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_common_and_layer_keycodes() {
        assert_eq!(binding_from_code(0x0004).display_label, "A");
        assert_eq!(binding_from_code(0x00AE).display_label, "播放/暂停");
        assert_eq!(binding_from_code(0x5222).display_label, "按住 L3");
        assert_eq!(binding_from_code(0x770A).display_label, "宏 M10");
    }

    #[test]
    fn preserves_unknown_raw_code() {
        let binding = binding_from_code(0x6ABC);
        assert_eq!(binding.qmk_name, "0x6ABC");
        assert_eq!(binding.display_label, "未知");
    }

    #[test]
    fn avoids_emoji_for_typographic_key_labels() {
        for code in [
            0x0104, 0x00A8, 0x00A9, 0x00AA, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x7849, 0x784A, 0x7C00,
        ] {
            assert_eq!(binding_from_code(code).icon, None, "keycode 0x{code:04X}");
        }
    }
}
