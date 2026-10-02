use crate::models::{
    EncoderDelta, InputState, MatrixPosition, LAYER_COUNT, MATRIX_COLS, MATRIX_ROWS,
    TELEMETRY_PROTOCOL_VERSION,
};

const PAYLOAD_OFFSET: usize = 3;
const MIN_RESPONSE_SIZE: usize = PAYLOAD_OFFSET + 1 + 1 + MATRIX_ROWS as usize + 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TelemetryFrame {
    pub active_layer: u8,
    pub matrix_rows: [u8; MATRIX_ROWS as usize],
    pub encoder_counters: [i8; 3],
}

impl TelemetryFrame {
    pub fn parse(response: &[u8]) -> Result<Self, TelemetryError> {
        if response.len() < MIN_RESPONSE_SIZE {
            return Err(TelemetryError::TooShort(response.len()));
        }
        let version = response[PAYLOAD_OFFSET];
        if version != TELEMETRY_PROTOCOL_VERSION {
            return Err(TelemetryError::UnsupportedVersion(version));
        }
        let active_layer = response[PAYLOAD_OFFSET + 1];
        if active_layer >= LAYER_COUNT {
            return Err(TelemetryError::InvalidLayer(active_layer));
        }
        let mut matrix_rows = [0u8; MATRIX_ROWS as usize];
        matrix_rows.copy_from_slice(
            &response[PAYLOAD_OFFSET + 2..PAYLOAD_OFFSET + 2 + MATRIX_ROWS as usize],
        );
        let counters_at = PAYLOAD_OFFSET + 2 + MATRIX_ROWS as usize;
        let encoder_counters = [
            response[counters_at] as i8,
            response[counters_at + 1] as i8,
            response[counters_at + 2] as i8,
        ];
        Ok(Self {
            active_layer,
            matrix_rows,
            encoder_counters,
        })
    }

    pub fn input_since(&self, previous: Option<&Self>) -> InputState {
        let mut pressed_positions = Vec::new();
        for row in 0..MATRIX_ROWS {
            for col in 0..MATRIX_COLS {
                if self.matrix_rows[row as usize] & (1 << col) != 0 {
                    pressed_positions.push(MatrixPosition { row, col });
                }
            }
        }

        let mut encoder_deltas = Vec::new();
        if let Some(previous) = previous {
            for (index, (&current, &old)) in self
                .encoder_counters
                .iter()
                .zip(previous.encoder_counters.iter())
                .enumerate()
            {
                let steps = current.wrapping_sub(old);
                if steps != 0 {
                    encoder_deltas.push(EncoderDelta {
                        id: format!("e{index}"),
                        steps,
                    });
                }
            }
        }
        InputState {
            pressed_positions,
            encoder_deltas,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TelemetryError {
    TooShort(usize),
    UnsupportedVersion(u8),
    InvalidLayer(u8),
}

impl std::fmt::Display for TelemetryError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort(size) => write!(formatter, "固件遥测回应过短: {size}"),
            Self::UnsupportedVersion(version) => {
                write!(formatter, "不支持的遥测协议版本: {version}")
            }
            Self::InvalidLayer(layer) => write!(formatter, "固件返回无效层: {layer}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response(layer: u8, rows: [u8; 4], counters: [u8; 3]) -> Vec<u8> {
        vec![
            0x08,
            0x00,
            0x42,
            1,
            layer,
            rows[0],
            rows[1],
            rows[2],
            rows[3],
            counters[0],
            counters[1],
            counters[2],
        ]
    }

    #[test]
    fn parses_matrix_and_encoder_delta() {
        let old = TelemetryFrame::parse(&response(0, [0, 0, 0, 0], [255, 1, 8])).unwrap();
        let current =
            TelemetryFrame::parse(&response(2, [0b1, 0b1_0000, 0, 0], [0, 0, 8])).unwrap();
        let input = current.input_since(Some(&old));
        assert_eq!(current.active_layer, 2);
        assert_eq!(
            input.pressed_positions,
            vec![
                MatrixPosition { row: 0, col: 0 },
                MatrixPosition { row: 1, col: 4 }
            ]
        );
        assert_eq!(input.encoder_deltas[0].steps, 1);
        assert_eq!(input.encoder_deltas[1].steps, -1);
    }

    #[test]
    fn rejects_unknown_version_and_short_packet() {
        assert_eq!(
            TelemetryFrame::parse(&[0; 2]),
            Err(TelemetryError::TooShort(2))
        );
        let mut packet = response(0, [0; 4], [0; 3]);
        packet[3] = 9;
        assert_eq!(
            TelemetryFrame::parse(&packet),
            Err(TelemetryError::UnsupportedVersion(9))
        );
    }
}
