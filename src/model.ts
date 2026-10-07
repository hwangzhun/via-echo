import type { DeviceStatus, EncoderBinding, KeyBinding } from "./types";

export const EMPTY_BINDING: KeyBinding = {
  rawCode: 0,
  qmkName: "KC_NO",
  displayLabel: "未设置",
  icon: null,
};

export function resolveKey(
  layers: KeyBinding[][],
  layer: number,
  row: number,
  col: number,
  cols = 5,
): KeyBinding {
  const index = row * cols + col;
  for (let candidate = Math.min(layer, layers.length - 1); candidate >= 0; candidate -= 1) {
    const binding = layers[candidate]?.[index];
    if (binding && binding.rawCode !== 0x0001) return binding;
  }
  return EMPTY_BINDING;
}

export function resolveEncoder(
  layers: EncoderBinding[][],
  layer: number,
  encoderIndex: number,
): EncoderBinding {
  const fallback: EncoderBinding = {
    id: `e${encoderIndex}`,
    press: EMPTY_BINDING,
    counterClockwise: EMPTY_BINDING,
    clockwise: EMPTY_BINDING,
  };
  const result = { ...fallback };
  for (const field of ["press", "counterClockwise", "clockwise"] as const) {
    for (let candidate = Math.min(layer, layers.length - 1); candidate >= 0; candidate -= 1) {
      const binding = layers[candidate]?.[encoderIndex]?.[field];
      if (binding && binding.rawCode !== 0x0001) {
        result[field] = binding;
        break;
      }
    }
  }
  return result;
}

export function statusText(status: DeviceStatus): string {
  return {
    connecting: "正在连接",
    connected: "已连接",
    incompatible: "无实时遥测",
    offline: "离线",
    error: "连接异常",
  }[status];
}

export function bindingText(binding: KeyBinding): string {
  if (binding.icon && binding.displayLabel.length > 3) return binding.icon;
  return binding.displayLabel;
}

// Telemetry support is separate from the physical connection state.
export function connectionState(status: DeviceStatus): "connected" | "disconnected" | "error" {
  if (status === "error") return "error";
  return status === "connected" || status === "incompatible" ? "connected" : "disconnected";
}
