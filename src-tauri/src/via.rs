use crate::models::{
    DEVICE_PID, DEVICE_VID, ENCODER_COUNT, LAYER_COUNT, MATRIX_COLS, MATRIX_ROWS, VIA_USAGE_PAGE,
};
use hidapi::{HidApi, HidDevice};
use std::thread;
use std::time::{Duration, Instant};

const REPORT_SIZE: usize = 32;
const COMMAND_GET_PROTOCOL: u8 = 0x01;
const COMMAND_GET_KEYCODE: u8 = 0x04;
const COMMAND_CUSTOM_GET: u8 = 0x08;
const COMMAND_GET_LAYER_COUNT: u8 = 0x11;
const COMMAND_GET_BUFFER: u8 = 0x12;
const COMMAND_GET_ENCODER: u8 = 0x14;
const EXCHANGE_ATTEMPTS: usize = 3;
const RESPONSE_TIMEOUT: Duration = Duration::from_millis(350);

pub const TELEMETRY_CHANNEL: u8 = 0x00;
pub const TELEMETRY_VALUE_ID: u8 = 0x42;

pub trait ViaTransport {
    fn exchange(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, String>;
}

pub struct HidTransport {
    device: HidDevice,
}

impl HidTransport {
    pub fn open() -> Result<Self, String> {
        let api = HidApi::new().map_err(|error| format!("HID 初始化失败: {error}"))?;
        let info = api
            .device_list()
            .find(|device| {
                device.vendor_id() == DEVICE_VID
                    && device.product_id() == DEVICE_PID
                    && device.usage_page() == VIA_USAGE_PAGE
            })
            .ok_or_else(|| "未检测到 DOIO KB16".to_string())?;
        let device = info
            .open_device(&api)
            .map_err(|error| format!("打开 DOIO KB16 失败: {error}"))?;
        Ok(Self { device })
    }
}

impl ViaTransport for HidTransport {
    fn exchange(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, String> {
        if payload.len() + 1 > REPORT_SIZE {
            return Err("VIA 请求超过 32 字节".into());
        }

        let mut last_unmatched = None;
        for attempt in 0..EXCHANGE_ATTEMPTS {
            let mut report = [0u8; REPORT_SIZE + 1];
            report[1] = command;
            report[2..2 + payload.len()].copy_from_slice(payload);
            let written = self
                .device
                .write(&report)
                .map_err(|error| format!("HID 写入失败: {error}"))?;
            if written != report.len() {
                return Err(format!("HID 写入长度异常: {written}"));
            }

            let deadline = Instant::now() + RESPONSE_TIMEOUT;
            loop {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    break;
                }
                let mut response = [0u8; REPORT_SIZE];
                let read = self
                    .device
                    .read_timeout(&mut response, remaining.as_millis().max(1) as i32)
                    .map_err(|error| format!("HID 读取失败: {error}"))?;
                if read == 0 {
                    break;
                }
                let response = response[..read].to_vec();
                if response_matches(&response, command, payload) {
                    return Ok(response);
                }
                // VIA and VIA Echo can share the Raw HID interface. Ignore a
                // packet belonging to the other client and keep waiting for
                // this request instead of treating it as a disconnect.
                last_unmatched = response.first().copied();
            }

            if attempt + 1 < EXCHANGE_ATTEMPTS {
                thread::sleep(Duration::from_millis(12));
            }
        }

        match last_unmatched {
            Some(other) => Err(format!(
                "VIA 正在同时通信，未收到匹配回应（最近 0x{other:02X}）"
            )),
            None => Err("HID 读取超时".into()),
        }
    }
}

fn response_matches(response: &[u8], command: u8, payload: &[u8]) -> bool {
    response.first().copied() == Some(command)
        && response.get(1..1 + payload.len()) == Some(payload)
}

pub struct ViaKeyboard<T: ViaTransport> {
    transport: T,
}

impl ViaKeyboard<HidTransport> {
    pub fn open() -> Result<Self, String> {
        Ok(Self::new(HidTransport::open()?))
    }
}

impl<T: ViaTransport> ViaKeyboard<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    pub fn protocol_version(&mut self) -> Result<u16, String> {
        let response = self.transport.exchange(COMMAND_GET_PROTOCOL, &[])?;
        let hi = *response.get(1).ok_or("VIA 协议回应过短")? as u16;
        let lo = *response.get(2).ok_or("VIA 协议回应过短")? as u16;
        Ok((hi << 8) | lo)
    }

    pub fn layer_count(&mut self) -> Result<u8, String> {
        let response = self.transport.exchange(COMMAND_GET_LAYER_COUNT, &[])?;
        response
            .get(1)
            .copied()
            .ok_or_else(|| "VIA 层数回应过短".into())
    }

    pub fn read_layers(&mut self) -> Result<Vec<Vec<u16>>, String> {
        let protocol = self.protocol_version()?;
        let available = if protocol >= 8 {
            self.layer_count()?
        } else {
            4
        };
        if available < LAYER_COUNT {
            return Err(format!("键盘仅提供 {available} 层，VIA Echo 需要 4 层"));
        }

        (0..LAYER_COUNT)
            .map(|layer| {
                if protocol >= 8 {
                    self.read_layer_buffer(layer)
                } else {
                    self.read_layer_keys(layer)
                }
            })
            .collect()
    }

    fn read_layer_buffer(&mut self, layer: u8) -> Result<Vec<u16>, String> {
        const KEYCODES_PER_CHUNK: usize = 14;
        let count = MATRIX_ROWS as usize * MATRIX_COLS as usize;
        let base = layer as usize * count * 2;
        let mut bytes = Vec::with_capacity(count * 2);
        while bytes.len() < count * 2 {
            let size = (count * 2 - bytes.len()).min(KEYCODES_PER_CHUNK * 2);
            let offset = base + bytes.len();
            let payload = [(offset >> 8) as u8, offset as u8, size as u8];
            let response = self.transport.exchange(COMMAND_GET_BUFFER, &payload)?;
            let chunk = response.get(4..4 + size).ok_or("VIA keymap 回应过短")?;
            bytes.extend_from_slice(chunk);
        }
        Ok(bytes
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
            .collect())
    }

    fn read_layer_keys(&mut self, layer: u8) -> Result<Vec<u16>, String> {
        let mut keys = Vec::with_capacity(MATRIX_ROWS as usize * MATRIX_COLS as usize);
        for row in 0..MATRIX_ROWS {
            for col in 0..MATRIX_COLS {
                let payload = [layer, row, col];
                let response = self.transport.exchange(COMMAND_GET_KEYCODE, &payload)?;
                let bytes = response.get(4..6).ok_or("VIA keycode 回应过短")?;
                keys.push(u16::from_be_bytes([bytes[0], bytes[1]]));
            }
        }
        Ok(keys)
    }

    pub fn read_encoder_codes(&mut self) -> Result<Vec<Vec<(u16, u16)>>, String> {
        let mut layers = Vec::with_capacity(LAYER_COUNT as usize);
        for layer in 0..LAYER_COUNT {
            let mut encoders = Vec::with_capacity(ENCODER_COUNT as usize);
            for encoder in 0..ENCODER_COUNT {
                let ccw = self.read_encoder(layer, encoder, false)?;
                let cw = self.read_encoder(layer, encoder, true)?;
                encoders.push((ccw, cw));
            }
            layers.push(encoders);
        }
        Ok(layers)
    }

    fn read_encoder(&mut self, layer: u8, encoder: u8, clockwise: bool) -> Result<u16, String> {
        let payload = [layer, encoder, clockwise as u8];
        let response = self.transport.exchange(COMMAND_GET_ENCODER, &payload)?;
        let bytes = response.get(4..6).ok_or("VIA encoder 回应过短")?;
        Ok(u16::from_be_bytes([bytes[0], bytes[1]]))
    }

    pub fn telemetry(&mut self) -> Result<Vec<u8>, String> {
        self.transport
            .exchange(COMMAND_CUSTOM_GET, &[TELEMETRY_CHANNEL, TELEMETRY_VALUE_ID])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    struct MockTransport {
        responses: VecDeque<Vec<u8>>,
    }

    impl ViaTransport for MockTransport {
        fn exchange(&mut self, _command: u8, _payload: &[u8]) -> Result<Vec<u8>, String> {
            self.responses
                .pop_front()
                .ok_or_else(|| "missing response".into())
        }
    }

    #[test]
    fn reads_protocol_version() {
        let transport = MockTransport {
            responses: VecDeque::from([vec![1, 0, 9]]),
        };
        let mut keyboard = ViaKeyboard::new(transport);
        assert_eq!(keyboard.protocol_version().unwrap(), 9);
    }

    #[test]
    fn distinguishes_interleaved_via_responses() {
        assert!(!response_matches(&[0x08, 0x00, 0x42], 0x01, &[]));
        assert!(!response_matches(
            &[0x12, 0x00, 0x20, 0x08],
            0x12,
            &[0x00, 0x00, 0x08]
        ));
        assert!(response_matches(
            &[0x12, 0x00, 0x00, 0x08, 0x00],
            0x12,
            &[0x00, 0x00, 0x08]
        ));
    }
}
