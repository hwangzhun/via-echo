import type { DeviceState, InputState, LayoutData } from "./types";

const segments = [
  "4,1 16,1 18,3 16,5 4,5 2,3",
  "17,6 19,4 19,16 17,18 15,16 15,8",
  "17,20 19,22 19,34 17,36 15,32 15,22",
  "4,35 16,35 18,37 16,39 4,39 2,37",
  "1,22 3,20 5,22 5,32 3,36 1,34",
  "1,4 3,6 5,8 5,16 3,18 1,16",
  "4,18 16,18 18,20 16,22 4,22 2,20",
];
const digits = ["012345", "12", "01346", "01236", "1256"];

function Digit({ value }: { value: number }) {
  return <svg viewBox="0 0 20 40" className="lcd-digit" aria-hidden="true">{segments.map((points, i) =>
    <polygon key={i} points={points} className={digits[value]?.includes(String(i)) ? "lit" : ""} />
  )}</svg>;
}

/** Telemetry stays honest: a cached or non-active layer never lights the input matrix. */
export function Y2kDisplay({ device, input, layer, layout }: {
  device: DeviceState; input: InputState; layer: number; layout: LayoutData | null;
}) {
  const live = device.status === "connected" && layer === device.activeLayer;
  const pressed = live ? input.pressedPositions : [];
  const mode = live ? "LIVE INPUT" : device.status === "error" ? "LINK ERROR" : device.layers.length ? "PREVIEW" : "NO DATA";
  return <section className="y2k-display" aria-label={`LCD 状态：第 ${layer + 1} 层，${live ? `实时输入，${pressed.length} 个按压` : "手动预览，无实时输入"}`}>
    <div className="lcd-layer"><span>LAYER</span><div><Digit value={0} /><Digit value={layer + 1} /></div></div>
    <div className="lcd-info"><strong>VIA<span> / </span>ECHO</strong><span className="lcd-mode"><i className={live ? "on" : ""} />{mode}</span><small>KB16 · DIGITAL CONTROL</small></div>
    <div className="lcd-input"><div className="lcd-matrix" aria-hidden="true">{(layout?.keys ?? []).map((key) => <i key={`${key.row}:${key.col}`} className={pressed.some((p) => p.row === key.row && p.col === key.col) ? "on" : ""} />)}</div><span>KEY INPUT</span></div>
    <div className="lcd-count"><span>HOLD</span><b>{String(pressed.length).padStart(2, "0")}</b><small>{live ? "SYNC" : "MANUAL"}</small></div>
  </section>;
}
