import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BindingIcon, ArrowCounterClockwiseIcon, ArrowClockwiseIcon } from "./icons";
import { resolveEncoder, resolveKey } from "./model";
import type { AppSettings, DeviceState, InputState, KeyBinding, LayoutData } from "./types";

export interface Selection { id: string; binding: KeyBinding; title: string }
interface Props {
  layout: LayoutData; device: DeviceState; settings: AppSettings; input: InputState; layer: number;
  selected?: string; onSelect?: (selection: Selection) => void;
}
export function Keyboard({ layout, device, settings, input, layer, selected, onSelect }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState<number>();
  useLayoutEffect(() => {
    const parent = stageRef.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    // Fit before the first paint as well as on resize; observer delivery may be delayed.
    const style = window.getComputedStyle(parent);
    const width = parent.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");
    const height = parent.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0");
    setStageWidth(Math.max(0, Math.min(width, height * layout.width / layout.height)));
    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(Math.min(entry.contentRect.width, entry.contentRect.height * layout.width / layout.height));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [layout.width, layout.height]);
  const live = device.status === "connected" && layer === device.activeLayer;
  const pressed = new Set(live ? input.pressedPositions.map((p) => `${p.row},${p.col}`) : []);
  const [flashes, setFlashes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!live) { setFlashes({}); return; }
    setFlashes(Object.fromEntries(input.encoderDeltas.map((d) => [d.id, d.steps < 0 ? "ccw" : "cw"])));
    const timer = window.setTimeout(() => setFlashes({}), 180);
    return () => window.clearTimeout(timer);
  }, [input, live, layer]);
  const name = (id: string, binding: KeyBinding) => settings.customLabels[id] ?? binding.displayLabel;
  const action = (id: string, binding: KeyBinding, title: string) => ({
    type: "button" as const, tabIndex: onSelect ? 0 : -1,
    "aria-label": `${title}：${name(id, binding)}`,
    "aria-pressed": onSelect ? selected === id : undefined,
    title: `${name(id, binding)} · ${binding.qmkName}`,
    onClick: () => onSelect?.({ id, binding, title }),
  });
  return <div ref={stageRef} className={`keyboard-stage ${onSelect ? "editing-labels" : ""}`} style={{ width: stageWidth, aspectRatio: `${layout.width} / ${layout.height}` }}>
    {layout.keys.map((key) => {
      const id = `key:${layer}:${key.row}:${key.col}`;
      const binding = resolveKey(device.layers, layer, key.row, key.col, layout.cols);
      return <button key={id} {...action(id, binding, `第 ${key.row + 1} 行第 ${key.col + 1} 键`)}
        className={`keycap ${pressed.has(`${key.row},${key.col}`) ? "pressed" : ""} ${binding.rawCode === 0 ? "empty" : ""} ${selected === id ? "selected" : ""}`}
        style={rectStyle(key, layout)}>
        {binding.icon && !settings.customLabels[id] && <BindingIcon glyph={binding.icon} />}
        <span className="binding-label">{name(id, binding)}</span>
      </button>;
    })}
    {layout.encoders.map((encoder, index) => {
      const binding = resolveEncoder(device.encoders, layer, index);
      return <div key={encoder.id} className={`encoder-unit ${encoder.id}`} style={rectStyle(encoder, layout)}>
        {(["ccw", "press", "cw"] as const).map((direction) => {
          const id = `encoder:${layer}:${index}:${direction}`;
          const value = direction === "press" ? binding.press : direction === "ccw" ? binding.counterClockwise : binding.clockwise;
          const title = `旋钮 ${index + 1} · ${direction === "press" ? "按压" : direction === "ccw" ? "逆时针" : "顺时针"}`;
          return <button key={direction} {...action(id, value, title)} className={`${direction === "press" ? `encoder-knob ${pressed.has(`${encoder.row},${encoder.col}`) ? "pressed" : ""}` : `encoder-direction ${direction} ${live && flashes[encoder.id] === direction ? "flash" : ""}`} ${selected === id ? "selected" : ""}`}>
            {direction === "press" ? <i aria-hidden="true" /> : direction === "ccw" ? <ArrowCounterClockwiseIcon aria-hidden="true" /> : <ArrowClockwiseIcon aria-hidden="true" />}
            <small>{name(id, value)}</small>
          </button>;
        })}
      </div>;
    })}
  </div>;
}
function rectStyle(rect: { x: number; y: number; w: number; h: number }, layout: LayoutData): CSSProperties {
  return { left: `${rect.x / layout.width * 100}%`, top: `${rect.y / layout.height * 100}%`, width: `${rect.w / layout.width * 100}%`, height: `${rect.h / layout.height * 100}%` };
}
export function LayerTabs({ layer, onChange }: { layer: number; onChange: (layer: number) => void }) {
  return <nav className="layer-tabs" aria-label="预览层">{[0, 1, 2, 3].map((n) => <button key={n} className={layer === n ? "active" : ""} aria-pressed={layer === n} onClick={() => onChange(n)}>L{n + 1}</button>)}</nav>;
}
