use rdev::{listen, Event, EventType, Key};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

static CURRENT_LAYER: AtomicU8 = AtomicU8::new(0);

pub fn set_current_layer(layer: u8) {
    CURRENT_LAYER.store(layer, Ordering::SeqCst);
}

fn rdev_key_to_qmk(key: Key) -> Option<u16> {
    use rdev::Key::*;
    let code = match key {
        KeyA => 0x0004,
        KeyB => 0x0005,
        KeyC => 0x0006,
        KeyD => 0x0007,
        KeyE => 0x0008,
        KeyF => 0x0009,
        KeyG => 0x000A,
        KeyH => 0x000B,
        KeyI => 0x000C,
        KeyJ => 0x000D,
        KeyK => 0x000E,
        KeyL => 0x000F,
        KeyM => 0x0010,
        KeyN => 0x0011,
        KeyO => 0x0012,
        KeyP => 0x0013,
        KeyQ => 0x0014,
        KeyR => 0x0015,
        KeyS => 0x0016,
        KeyT => 0x0017,
        KeyU => 0x0018,
        KeyV => 0x0019,
        KeyW => 0x001A,
        KeyX => 0x001B,
        KeyY => 0x001C,
        KeyZ => 0x001D,
        Num1 => 0x001E,
        Num2 => 0x001F,
        Num3 => 0x0020,
        Num4 => 0x0021,
        Num5 => 0x0022,
        Num6 => 0x0023,
        Num7 => 0x0024,
        Num8 => 0x0025,
        Num9 => 0x0026,
        Num0 => 0x0027,
        Return => 0x0028,
        Escape => 0x0029,
        Backspace => 0x002A,
        Tab => 0x002B,
        Space => 0x002C,
        Minus => 0x002D,
        Equal => 0x002E,
        LeftBracket => 0x002F,
        RightBracket => 0x0030,
        BackSlash => 0x0031,
        SemiColon => 0x0033,
        Quote => 0x0034,
        BackQuote => 0x0035,
        Comma => 0x0036,
        Dot => 0x0037,
        Slash => 0x0038,
        CapsLock => 0x0039,
        F1 => 0x003A,
        F2 => 0x003B,
        F3 => 0x003C,
        F4 => 0x003D,
        F5 => 0x003E,
        F6 => 0x003F,
        F7 => 0x0040,
        F8 => 0x0041,
        F9 => 0x0042,
        F10 => 0x0043,
        F11 => 0x0044,
        F12 => 0x0045,
        Insert => 0x0049,
        Delete => 0x004C,
        Home => 0x004A,
        End => 0x004D,
        PageDown => 0x004E,
        PageUp => 0x004B,
        LeftArrow => 0x0050,
        DownArrow => 0x0051,
        RightArrow => 0x004F,
        UpArrow => 0x0052,
        ControlLeft => 0x00E0,
        ShiftLeft => 0x00E1,
        Alt => 0x00E2,
        MetaLeft => 0x00E3,
        ControlRight => 0x00E4,
        ShiftRight => 0x00E5,
        AltGr => 0x00E6,
        MetaRight => 0x00E7,
        _ => return None,
    };
    Some(code)
}

pub fn spawn_key_listener(
    app: AppHandle,
    keymap_raw: Arc<std::sync::Mutex<Option<(Vec<Vec<u16>>, u8, u8)>>>,
) {
    thread::spawn(move || {
        let _ = listen(move |event: Event| {
            let (key, pressed) = match &event.event_type {
                EventType::KeyPress(k) => (k, true),
                EventType::KeyRelease(k) => (k, false),
                _ => return,
            };
            let code = match rdev_key_to_qmk(*key) {
                Some(c) => c,
                None => return,
            };
            let guard = match keymap_raw.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let Some((layers, rows, cols)) = guard.as_ref() else { return };
            let layer_idx = CURRENT_LAYER.load(Ordering::SeqCst) as usize;
            if layer_idx >= layers.len() {
                return;
            }
            let layer = &layers[layer_idx];
            let total = (*rows as usize) * (*cols as usize);
            for (idx, &kc) in layer.iter().take(total).enumerate() {
                if kc == code {
                    let row = (idx / (*cols as usize)) as u8;
                    let col = (idx % (*cols as usize)) as u8;
                    let payload = serde_json::json!({
                        "row": row,
                        "col": col,
                        "pressed": pressed
                    });
                    let _ = app.emit("key-event", payload);
                    break;
                }
            }
        });
    });
}
