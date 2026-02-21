export interface LayoutData {
  name: string;
  rows: number;
  cols: number;
  width: number;
  height: number;
  keys: Array<{ row: number; col: number; x: number; y: number; w: number; h: number }>;
  encoders: Array<{ id: string; row: number; col: number; x: number; y: number; w: number; h: number }>;
}

export interface KeymapData {
  layers: string[][];
  rows: number;
  cols: number;
}

export interface KeyEventPayload {
  row: number;
  col: number;
  pressed: boolean;
  keycode?: string;
}
