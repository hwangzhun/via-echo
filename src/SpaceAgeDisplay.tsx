import { useEffect, useRef, useState } from "react";
import type { DeviceState, InputState, LayoutData } from "./types";

interface Props { device: DeviceState; input: InputState; layer: number; layout: LayoutData | null }
const flat = () => Array<number>(24).fill(0);

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** A new telemetry session discards history when the visible layer or link changes. */
export function SpaceAgeDisplay(props: Props) {
  return <TelemetryDisplay key={`${props.layer}:${props.device.activeLayer}:${props.device.status}`} {...props} />;
}

function TelemetryDisplay({ device, input, layer, layout }: Props) {
  const live = device.status === "connected" && layer === device.activeLayer;
  const reduced = useReducedMotion();
  const [history, setHistory] = useState(flat);
  const held = useRef(0);
  const pulse = useRef(0);
  const previousInput = useRef(input);
  useEffect(() => {
    held.current = live ? input.pressedPositions.length : 0;
    // Consume encoder deltas once, and retain short key taps between samples.
    // A cached packet on mount/layer change is not a fresh rotary event.
    const rotary = input !== previousInput.current
      ? input.encoderDeltas.reduce((sum, delta) => sum + Math.abs(delta.steps), 0) : 0;
    previousInput.current = input;
    pulse.current = live && !reduced ? Math.max(pulse.current, held.current, rotary) : 0;
  }, [input, live, reduced]);
  useEffect(() => {
    if (!live || reduced) { setHistory(flat()); pulse.current = 0; return; }
    const timer = window.setInterval(() => {
      const activity = Math.min(10, Math.max(held.current, pulse.current));
      pulse.current = 0;
      setHistory((previous) => activity === 0 && previous.every((n) => n === 0)
        ? previous : [...previous.slice(1), activity]);
    }, 160);
    return () => window.clearInterval(timer);
  }, [live, reduced]);

  const pressed = live ? input.pressedPositions : [];
  const mode = live ? "LIVE INPUT" : device.status === "error" ? "LINK ERROR"
    : device.status === "incompatible" ? "NO TELEMETRY" : device.status === "connecting" ? "CONNECTING"
    : device.status === "offline" ? "OFFLINE" : "PREVIEW";
  const description = live ? `实时输入，${pressed.length} 个按压` : mode === "PREVIEW" ? "手动预览，无实时输入"
    : device.status === "error" ? "连接错误，无实时输入" : device.status === "incompatible" ? "已连接，无遥测"
    : device.status === "connecting" ? "连接中，无实时输入" : "离线，无实时输入";
  const points = history.map((n, i) => `${i * 4},${14 - n * 1.1}`).join(" ");
  return <section className={`space-display ${live ? "is-live" : ""}`} aria-label={`Space Age 状态：第 ${layer + 1} 层，${description}`}>
    <div className="space-layer"><span>LAYER</span><b>{String(layer + 1).padStart(2, "0")}</b></div>
    <div className="space-identity"><strong>SPACE<span>AGE</span></strong><span className="space-mode"><i />{mode}</span><small>ORBITAL INPUT SYSTEM</small></div>
    <svg className="space-globe" viewBox="0 0 60 60" fill="none" aria-hidden="true">
      <circle cx="30" cy="30" r="24" /><ellipse cx="30" cy="30" rx="11" ry="24" />
      <ellipse cx="30" cy="30" rx="24" ry="9" /><path d="M6 30h48M30 6v48" />
      <ellipse cx="30" cy="30" rx="29" ry="12" transform="rotate(-35 30 30)" />
      <g className="space-radar"><path d="M30 30V6A24 24 0 0 1 47 13Z" /><path d="M30 30 47 13" /></g>
      <circle className="space-satellite" cx="52" cy="12" r="2" />
    </svg>
    <div className="space-wave"><span>INPUT ACTIVITY</span><svg viewBox="0 0 92 28" preserveAspectRatio="none" aria-hidden="true"><path className="space-wave-grid" d="M0 7h92M0 14h92M0 21h92M23 0v28M46 0v28M69 0v28" /><polyline points={points} /></svg></div>
    <div className="space-input"><div className="space-matrix" aria-hidden="true">{(layout?.keys ?? []).map((key) => <i key={`${key.row}:${key.col}`} className={pressed.some((p) => p.row === key.row && p.col === key.col) ? "on" : ""} style={{ gridColumn: key.col + 1, gridRow: key.row + 1 }} />)}</div><span>KEY INPUT</span></div>
    <div className="space-count"><span>HOLD</span><b>{String(pressed.length).padStart(2, "0")}</b></div>
  </section>;
}
