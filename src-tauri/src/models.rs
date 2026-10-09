use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const DEVICE_VID: u16 = 0xD010;
pub const DEVICE_PID: u16 = 0x1601;
pub const VIA_USAGE_PAGE: u16 = 0xFF60;
pub const MATRIX_ROWS: u8 = 4;
pub const MATRIX_COLS: u8 = 5;
pub const LAYER_COUNT: u8 = 4;
pub const ENCODER_COUNT: u8 = 3;
pub const CACHE_VERSION: u8 = 1;
pub const TELEMETRY_PROTOCOL_VERSION: u8 = 1;
pub const DEFAULT_ACCENT_COLOR: &str = "#7FA6C4";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KeyBinding {
    pub raw_code: u16,
    pub qmk_name: String,
    pub display_label: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EncoderBinding {
    pub id: String,
    pub press: KeyBinding,
    pub counter_clockwise: KeyBinding,
    pub clockwise: KeyBinding,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DeviceStatus {
    Connecting,
    Connected,
    Incompatible,
    Offline,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceState {
    pub status: DeviceStatus,
    pub active_layer: u8,
    pub layers: Vec<Vec<KeyBinding>>,
    pub encoders: Vec<Vec<EncoderBinding>>,
    pub cached_at: Option<u64>,
    pub message: Option<String>,
}

impl Default for DeviceState {
    fn default() -> Self {
        Self {
            status: DeviceStatus::Connecting,
            active_layer: 0,
            layers: Vec::new(),
            encoders: Vec::new(),
            cached_at: None,
            message: Some("正在查找 DOIO KB16…".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MatrixPosition {
    pub row: u8,
    pub col: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EncoderDelta {
    pub id: String,
    pub steps: i8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct InputState {
    pub pressed_positions: Vec<MatrixPosition>,
    pub encoder_deltas: Vec<EncoderDelta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: ThemeMode,
    pub accent_color: String,
    pub opacity: f64,
    pub auto_fade: bool,
    pub auto_fade_delay: f64,
    pub faded_opacity: f64,
    pub always_on_top: bool,
    pub click_through: bool,
    pub launch_at_login: bool,
    pub custom_labels: HashMap<String, String>,
}

/// Only supplied fields are changed. Label entries are merged; null removes one label.
#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsPatch {
    pub theme: Option<ThemeMode>,
    pub accent_color: Option<String>,
    pub opacity: Option<f64>,
    pub auto_fade: Option<bool>,
    pub auto_fade_delay: Option<f64>,
    pub faded_opacity: Option<f64>,
    pub always_on_top: Option<bool>,
    pub click_through: Option<bool>,
    pub launch_at_login: Option<bool>,
    pub custom_labels: Option<HashMap<String, Option<String>>>,
}

impl SettingsPatch {
    pub fn apply(self, current: &AppSettings) -> AppSettings {
        let mut next = current.clone();
        macro_rules! patch {
            ($($field:ident),*) => { $(if let Some(value) = self.$field { next.$field = value; })* };
        }
        patch!(
            theme,
            accent_color,
            opacity,
            auto_fade,
            auto_fade_delay,
            faded_opacity,
            always_on_top,
            click_through,
            launch_at_login
        );
        if let Some(labels) = self.custom_labels {
            for (id, value) in labels {
                match value {
                    Some(label) => {
                        next.custom_labels.insert(id, label);
                    }
                    None => {
                        next.custom_labels.remove(&id);
                    }
                }
            }
        }
        next.normalized()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefreshState {
    pub status: RefreshStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RefreshStatus {
    #[default]
    Idle,
    Running,
    Success,
    Error,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    #[default]
    Dark,
    Light,
    Y2k,
    #[serde(rename = "spaceAge")]
    SpaceAge,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemeMode::Dark,
            accent_color: DEFAULT_ACCENT_COLOR.into(),
            opacity: 0.92,
            auto_fade: true,
            auto_fade_delay: 2.8,
            faded_opacity: 0.42,
            always_on_top: true,
            click_through: false,
            launch_at_login: false,
            custom_labels: HashMap::new(),
        }
    }
}

impl AppSettings {
    pub fn normalized(mut self) -> Self {
        self.accent_color = normalize_accent_color(&self.accent_color)
            .unwrap_or_else(|| DEFAULT_ACCENT_COLOR.into());
        self.opacity = self.opacity.clamp(0.35, 1.0);
        self.auto_fade_delay = self.auto_fade_delay.clamp(1.0, 30.0);
        self.faded_opacity = self.faded_opacity.clamp(0.15, self.opacity);
        self.custom_labels.retain(|key, value| {
            *value = value.trim().chars().take(24).collect();
            !key.is_empty() && !value.is_empty()
        });
        self
    }
}

fn normalize_accent_color(value: &str) -> Option<String> {
    let value = value.trim();
    if value.len() == 7
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        Some(value.to_ascii_uppercase())
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LayoutData {
    pub name: String,
    pub rows: u8,
    pub cols: u8,
    pub width: f64,
    pub height: f64,
    pub keys: Vec<KeyRect>,
    pub encoders: Vec<EncoderRect>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyRect {
    pub row: u8,
    pub col: u8,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EncoderRect {
    pub id: String,
    pub row: u8,
    pub col: u8,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metallic_skin_round_trips_without_changing_existing_preferences() {
        let initial = AppSettings {
            accent_color: "#F29A67".into(),
            ..Default::default()
        };
        let patch: SettingsPatch = serde_json::from_str(r#"{"theme":"y2k"}"#).unwrap();
        let metallic = patch.apply(&initial);
        assert_eq!(metallic.theme, ThemeMode::Y2k);
        let saved = serde_json::to_string(&metallic).unwrap();
        let loaded: AppSettings = serde_json::from_str(&saved).unwrap();
        assert_eq!(loaded, metallic);
        let reset: SettingsPatch = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(reset.apply(&loaded), initial);
    }

    #[test]
    fn space_age_round_trips_and_preserves_all_other_preferences() {
        let initial = AppSettings {
            accent_color: "#F29A67".into(),
            opacity: 0.7,
            custom_labels: HashMap::from([("key:0:0:0".into(), "复制".into())]),
            ..Default::default()
        };
        let patch: SettingsPatch = serde_json::from_str(r#"{"theme":"spaceAge"}"#).unwrap();
        let themed = patch.apply(&initial);
        assert_eq!(themed.theme, ThemeMode::SpaceAge);
        let saved = serde_json::to_value(&themed).unwrap();
        assert_eq!(saved["theme"], "spaceAge");
        let loaded: AppSettings = serde_json::from_value(saved).unwrap();
        assert_eq!(loaded, themed);
        for (wire, mode) in [("dark", ThemeMode::Dark), ("light", ThemeMode::Light), ("y2k", ThemeMode::Y2k)] {
            let mut expected = initial.clone();
            expected.theme = mode;
            let patch: SettingsPatch = serde_json::from_value(serde_json::json!({"theme": wire})).unwrap();
            assert_eq!(patch.apply(&loaded), expected);
        }
    }

    #[test]
    fn patches_preserve_other_fields_and_merge_individual_labels() {
        let initial = AppSettings::default();
        let first: SettingsPatch = serde_json::from_str(
            r#"{"opacity":0.7,"customLabels":{"key:0:0:0":"复制","key:1:0:0":"剪辑"}}"#,
        )
        .unwrap();
        let second: SettingsPatch = serde_json::from_str(
            r#"{"theme":"light","customLabels":{"key:0:0:0":null,"encoder:0:0:cw":"音量"}}"#,
        )
        .unwrap();
        let updated = second.apply(&first.apply(&initial));
        assert_eq!(updated.opacity, 0.7);
        assert_eq!(updated.theme, ThemeMode::Light);
        assert_eq!(updated.custom_labels.get("key:1:0:0").unwrap(), "剪辑");
        assert_eq!(updated.custom_labels.get("encoder:0:0:cw").unwrap(), "音量");
        assert!(!updated.custom_labels.contains_key("key:0:0:0"));
        assert_eq!(updated.auto_fade, initial.auto_fade);
    }

    #[test]
    fn rapid_independent_patches_keep_latest_values_and_normalize_opacity() {
        let mut state = AppSettings::default();
        for opacity in [0.8, 0.6, 0.4] {
            state = SettingsPatch {
                opacity: Some(opacity),
                ..Default::default()
            }
            .apply(&state);
            state = SettingsPatch {
                click_through: Some(true),
                ..Default::default()
            }
            .apply(&state);
        }
        assert_eq!(state.opacity, 0.4);
        assert_eq!(state.faded_opacity, 0.4);
        assert!(state.click_through);
        let updated = SettingsPatch {
            custom_labels: Some(HashMap::from([("key:0:0:0".into(), Some("🎵".repeat(30)))])),
            ..Default::default()
        }
        .apply(&state);
        assert_eq!(updated.custom_labels["key:0:0:0"].chars().count(), 24);
    }

    #[test]
    fn settings_are_clamped() {
        let low = AppSettings {
            opacity: 0.1,
            auto_fade_delay: 0.2,
            ..Default::default()
        }
        .normalized();
        let high = AppSettings {
            opacity: 4.0,
            auto_fade_delay: 90.0,
            ..Default::default()
        }
        .normalized();
        assert_eq!(low.opacity, 0.35);
        assert_eq!(low.auto_fade_delay, 1.0);
        assert_eq!(high.opacity, 1.0);
        assert_eq!(high.auto_fade_delay, 30.0);
    }

    #[test]
    fn old_settings_files_receive_new_defaults() {
        let settings: AppSettings = serde_json::from_str(
            r#"{"opacity":0.8,"alwaysOnTop":true,"clickThrough":false,"launchAtLogin":false}"#,
        )
        .unwrap();
        assert!(settings.auto_fade);
        assert_eq!(settings.auto_fade_delay, 2.8);
        assert_eq!(settings.theme, ThemeMode::Dark);
        assert_eq!(settings.accent_color, DEFAULT_ACCENT_COLOR);
        assert_eq!(settings.faded_opacity, 0.42);
        assert!(settings.custom_labels.is_empty());
    }

    #[test]
    fn accent_color_is_normalized_or_reset() {
        let custom = AppSettings {
            accent_color: " #6f91b2 ".into(),
            ..Default::default()
        }
        .normalized();
        assert_eq!(custom.accent_color, "#6F91B2");

        let invalid = AppSettings {
            accent_color: "blue".into(),
            ..Default::default()
        }
        .normalized();
        assert_eq!(invalid.accent_color, DEFAULT_ACCENT_COLOR);
    }
}
