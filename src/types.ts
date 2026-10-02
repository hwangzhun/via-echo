export interface KeyBinding {
  rawCode: number;
  qmkName: string;
  displayLabel: string;
  icon?: string | null;
}

export interface EncoderBinding {
  id: string;
  press: KeyBinding;
  counterClockwise: KeyBinding;
  clockwise: KeyBinding;
}

export type DeviceStatus = "connecting" | "connected" | "incompatible" | "offline" | "error";

export interface DeviceState {
  status: DeviceStatus;
  activeLayer: number;
  layers: KeyBinding[][];
  encoders: EncoderBinding[][];
  cachedAt?: number | null;
  message?: string | null;
}

export interface MatrixPosition {
  row: number;
  col: number;
}

export interface EncoderDelta {
  id: string;
  steps: number;
}

export interface InputState {
  pressedPositions: MatrixPosition[];
  encoderDeltas: EncoderDelta[];
}

export interface AppSettings {
  theme: "dark" | "light";
  opacity: number;
  autoFade: boolean;
  fadedOpacity: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  launchAtLogin: boolean;
  customLabels: Record<string, string>;
}

export interface LayoutData {
  name: string;
  rows: number;
  cols: number;
  width: number;
  height: number;
  keys: Array<{ row: number; col: number; x: number; y: number; w: number; h: number }>;
  encoders: Array<{ id: string; row: number; col: number; x: number; y: number; w: number; h: number }>;
}
