use crate::keycodes::binding_from_code;
use crate::models::{
    DeviceState, DeviceStatus, EncoderBinding, InputState, ENCODER_COUNT, LAYER_COUNT, MATRIX_COLS,
};
use crate::storage::save_cached_state;
use crate::telemetry::TelemetryFrame;
use crate::via::{HidTransport, ViaKeyboard};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

enum ServiceCommand {
    Refresh,
    Stop,
}

pub struct DeviceService {
    state: Arc<Mutex<DeviceState>>,
    sender: mpsc::Sender<ServiceCommand>,
}

impl DeviceService {
    pub fn spawn(app: AppHandle, initial_state: DeviceState) -> Self {
        let state = Arc::new(Mutex::new(initial_state));
        let worker_state = Arc::clone(&state);
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || run_worker(app, worker_state, receiver));
        Self { state, sender }
    }

    pub fn state(&self) -> DeviceState {
        self.state
            .lock()
            .map(|state| state.clone())
            .unwrap_or_default()
    }

    pub fn refresh(&self) -> Result<(), String> {
        self.sender
            .send(ServiceCommand::Refresh)
            .map_err(|error| error.to_string())
    }
}

impl Drop for DeviceService {
    fn drop(&mut self) {
        let _ = self.sender.send(ServiceCommand::Stop);
    }
}

fn run_worker(
    app: AppHandle,
    shared_state: Arc<Mutex<DeviceState>>,
    receiver: mpsc::Receiver<ServiceCommand>,
) {
    let mut keyboard: Option<ViaKeyboard<HidTransport>> = None;
    let mut compatible = false;
    let mut previous_frame: Option<TelemetryFrame> = None;
    let mut previous_input = InputState::default();
    let mut last_probe = Instant::now() - Duration::from_secs(2);
    let mut last_poll = Instant::now();
    let mut failures = 0u8;

    loop {
        let mut refresh_requested = false;
        while let Ok(command) = receiver.try_recv() {
            match command {
                ServiceCommand::Refresh => refresh_requested = true,
                ServiceCommand::Stop => return,
            }
        }

        if keyboard.is_none() && last_probe.elapsed() >= Duration::from_secs(1) {
            last_probe = Instant::now();
            match ViaKeyboard::open() {
                Ok(mut opened) => match load_bindings(&mut opened, &shared_state) {
                    Ok(()) => {
                        let telemetry = opened.telemetry().and_then(|data| {
                            TelemetryFrame::parse(&data).map_err(|error| error.to_string())
                        });
                        match telemetry {
                            Ok(frame) => {
                                compatible = true;
                                previous_input = frame.input_since(None);
                                previous_frame = Some(frame.clone());
                                update_connected_state(&app, &shared_state, frame.active_layer);
                                let _ = app.emit("input-state", &previous_input);
                            }
                            Err(message) => {
                                compatible = false;
                                previous_frame = None;
                                set_status(
                                    &app,
                                    &shared_state,
                                    DeviceStatus::Incompatible,
                                    Some(format!(
                                        "已读取键位，但固件不支持 VIA Echo 遥测：{message}"
                                    )),
                                );
                            }
                        }
                        keyboard = Some(opened);
                        failures = 0;
                    }
                    Err(message) => {
                        set_status(&app, &shared_state, DeviceStatus::Error, Some(message));
                    }
                },
                Err(_) => {
                    let has_cache = shared_state
                        .lock()
                        .map(|state| !state.layers.is_empty())
                        .unwrap_or(false);
                    set_status(
                        &app,
                        &shared_state,
                        DeviceStatus::Offline,
                        Some(if has_cache {
                            "键盘未连接，正在显示缓存键位".into()
                        } else {
                            "请连接 DOIO KB16".into()
                        }),
                    );
                }
            }
        }

        if let Some(opened) = keyboard.as_mut() {
            if refresh_requested {
                match load_bindings(opened, &shared_state) {
                    Ok(()) => emit_state(&app, &shared_state),
                    Err(message) => {
                        set_status(&app, &shared_state, DeviceStatus::Error, Some(message))
                    }
                }
            }

            let interval = if compatible {
                Duration::from_millis(33)
            } else {
                Duration::from_secs(1)
            };
            if last_poll.elapsed() >= interval {
                last_poll = Instant::now();
                if compatible {
                    match opened.telemetry().and_then(|data| {
                        TelemetryFrame::parse(&data).map_err(|error| error.to_string())
                    }) {
                        Ok(frame) => {
                            failures = 0;
                            let input = frame.input_since(previous_frame.as_ref());
                            if input.pressed_positions != previous_input.pressed_positions
                                || !input.encoder_deltas.is_empty()
                            {
                                let _ = app.emit("input-state", &input);
                            }
                            if previous_frame.as_ref().map(|old| old.active_layer)
                                != Some(frame.active_layer)
                            {
                                update_connected_state(&app, &shared_state, frame.active_layer);
                            }
                            previous_input = InputState {
                                pressed_positions: input.pressed_positions,
                                encoder_deltas: Vec::new(),
                            };
                            previous_frame = Some(frame);
                        }
                        Err(_) => failures = failures.saturating_add(1),
                    }
                } else if opened.protocol_version().is_err() {
                    failures = 3;
                }

                if failures >= 3 {
                    keyboard = None;
                    compatible = false;
                    previous_frame = None;
                    previous_input = InputState::default();
                    let _ = app.emit("input-state", InputState::default());
                    set_status(
                        &app,
                        &shared_state,
                        DeviceStatus::Offline,
                        Some("键盘已断开，正在显示缓存键位".into()),
                    );
                    last_probe = Instant::now() - Duration::from_secs(1);
                }
            }
        }

        thread::sleep(Duration::from_millis(10));
    }
}

fn load_bindings(
    keyboard: &mut ViaKeyboard<HidTransport>,
    shared_state: &Arc<Mutex<DeviceState>>,
) -> Result<(), String> {
    let raw_layers = keyboard.read_layers()?;
    let raw_encoders = keyboard.read_encoder_codes()?;
    let layers = raw_layers
        .iter()
        .map(|layer| layer.iter().copied().map(binding_from_code).collect())
        .collect::<Vec<Vec<_>>>();
    let encoders = build_encoder_bindings(&raw_layers, &raw_encoders)?;

    let mut snapshot = shared_state
        .lock()
        .map_err(|_| "设备状态锁已损坏".to_string())?;
    snapshot.layers = layers;
    snapshot.encoders = encoders;
    if let Ok(cached_at) = save_cached_state(&snapshot) {
        snapshot.cached_at = Some(cached_at);
    }
    Ok(())
}

fn build_encoder_bindings(
    raw_layers: &[Vec<u16>],
    raw_encoders: &[Vec<(u16, u16)>],
) -> Result<Vec<Vec<EncoderBinding>>, String> {
    if raw_layers.len() != LAYER_COUNT as usize || raw_encoders.len() != LAYER_COUNT as usize {
        return Err("键位层数不是 4".into());
    }
    let mut result = Vec::with_capacity(LAYER_COUNT as usize);
    for layer in 0..LAYER_COUNT as usize {
        if raw_encoders[layer].len() != ENCODER_COUNT as usize {
            return Err("旋钮映射数量不是 3".into());
        }
        let mut values = Vec::with_capacity(ENCODER_COUNT as usize);
        for (encoder, &(counter_clockwise, clockwise)) in raw_encoders[layer].iter().enumerate() {
            let press_index = encoder * MATRIX_COLS as usize + 4;
            let press = *raw_layers[layer]
                .get(press_index)
                .ok_or("旋钮按压键位缺失")?;
            values.push(EncoderBinding {
                id: format!("e{encoder}"),
                press: binding_from_code(press),
                counter_clockwise: binding_from_code(counter_clockwise),
                clockwise: binding_from_code(clockwise),
            });
        }
        result.push(values);
    }
    Ok(result)
}

fn update_connected_state(app: &AppHandle, shared_state: &Arc<Mutex<DeviceState>>, layer: u8) {
    if let Ok(mut state) = shared_state.lock() {
        state.status = DeviceStatus::Connected;
        state.active_layer = layer;
        state.message = None;
    }
    emit_state(app, shared_state);
}

fn set_status(
    app: &AppHandle,
    shared_state: &Arc<Mutex<DeviceState>>,
    status: DeviceStatus,
    message: Option<String>,
) {
    let changed = if let Ok(mut state) = shared_state.lock() {
        let changed = state.status != status || state.message != message;
        state.status = status;
        state.message = message;
        changed
    } else {
        false
    };
    if changed {
        emit_state(app, shared_state);
    }
}

fn emit_state(app: &AppHandle, shared_state: &Arc<Mutex<DeviceState>>) {
    if let Ok(state) = shared_state.lock() {
        let _ = app.emit("device-state", state.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encoder_press_comes_from_matrix_column_four() {
        let layers = vec![vec![0u16; 20]; 4];
        let encoders = vec![vec![(0x00AC, 0x00AB); 3]; 4];
        let result = build_encoder_bindings(&layers, &encoders).unwrap();
        assert_eq!(result.len(), 4);
        assert_eq!(result[0][0].counter_clockwise.display_label, "上一曲");
        assert_eq!(result[0][0].clockwise.display_label, "下一曲");
        assert_eq!(result[0][0].press.raw_code, 0);
    }
}
