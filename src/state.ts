import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppSettings, DeviceState, InputState, LayoutData, RefreshState, SettingsPatch } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark", accentColor: "#7FA6C4", opacity: 0.92, autoFade: true,
  autoFadeDelay: 2.8, fadedOpacity: 0.42, alwaysOnTop: true,
  clickThrough: false, launchAtLogin: false, customLabels: {},
};
const EMPTY_INPUT: InputState = { pressedPositions: [], encoderDeltas: [] };
const INITIAL_DEVICE: DeviceState = {
  status: "connecting", activeLayer: 0, layers: [], encoders: [], message: "正在查找 DOIO KB16…",
};

export function useAppState() {
  const [layout, setLayout] = useState<LayoutData | null>(null);
  const [device, setDevice] = useState(INITIAL_DEVICE);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [input, setInput] = useState(EMPTY_INPUT);
  const [refresh, setRefresh] = useState<RefreshState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const settingsRevision = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let disposed = false;
    const cleanups: UnlistenFn[] = [];
    let deviceChanged = false;
    let refreshChanged = false;
    let inputChanged = false;
    const subscribe = async <T,>(name: string, handler: (payload: T) => void) => {
      const off = await listen<T>(name, ({ payload }) => { if (!disposed) handler(payload); });
      if (disposed) off(); else cleanups.push(off);
    };
    setError(null);
    setReady(false);
    const initialize = async () => {
      await Promise.all([
        subscribe<DeviceState>("device-state", (next) => {
          deviceChanged = true;
          setDevice(next);
          if (next.status !== "connected") { inputChanged = true; setInput(EMPTY_INPUT); }
        }),
        subscribe<InputState>("input-state", (next) => { inputChanged = true; setInput(next); }),
        subscribe<AppSettings>("settings-changed", (next) => {
          settingsRevision.current++;
          setSettings({ ...DEFAULT_SETTINGS, ...next });
        }),
        subscribe<RefreshState>("refresh-state", (next) => { refreshChanged = true; setRefresh(next); }),
      ]);
      if (disposed) return;
      const revision = settingsRevision.current;
      const [nextLayout, nextDevice, nextSettings, nextRefresh, nextInput] = await Promise.all([
        invoke<LayoutData>("get_layout"), invoke<DeviceState>("get_initial_state"),
        invoke<AppSettings>("get_settings"), invoke<RefreshState>("get_refresh_state"), invoke<InputState>("get_input_state"),
      ]);
      if (disposed) return;
      setLayout(nextLayout);
      if (!deviceChanged) setDevice(nextDevice);
      if (revision === settingsRevision.current) setSettings({ ...DEFAULT_SETTINGS, ...nextSettings });
      if (!refreshChanged) setRefresh(nextRefresh);
      if (!inputChanged) setInput(nextInput);
      setReady(true);
    };
    void initialize().catch((reason) => { if (!disposed) setError(String(reason)); });
    return () => { disposed = true; cleanups.forEach((off) => off()); };
  }, [attempt]);

  const saveSettings = useCallback((patch: SettingsPatch) => {
    const operation = queue.current.catch(() => undefined).then(async () => {
      const revision = settingsRevision.current;
      const next = await invoke<AppSettings>("update_settings", { patch });
      if (revision === settingsRevision.current) setSettings(next);
      return next;
    });
    queue.current = operation;
    return operation;
  }, []);
  return { layout, device, settings, input, refresh, error, ready, saveSettings, retry: () => setAttempt((n) => n + 1) };
}
export type AppState = ReturnType<typeof useAppState>;

export function useTheme(settings: AppSettings) {
  useEffect(() => {
    const rgb = [1, 3, 5].map((offset) => parseInt(settings.accentColor.slice(offset, offset + 2), 16));
    const mix = (target: number, amount: number) => `rgb(${rgb.map((v) => Math.round(v + (target - v) * amount)).join(",")})`;
    const vars: Record<string, string> = {
      "window-opacity": String(settings.opacity), "faded-opacity": String(settings.fadedOpacity),
      accent: settings.accentColor, "accent-rgb": rgb.join(","),
      "accent-strong": mix(0, .18), "accent-soft": mix(255, .48),
      "accent-mid": mix(255, .14), "accent-deep": mix(0, .34),
      "accent-contrast": rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 155 ? "#14232e" : "#ffffff",
    };
    Object.entries(vars).forEach(([name, value]) => document.documentElement.style.setProperty(`--${name}`, value));
  }, [settings]);
}

export function useAutoFade(settings: AppSettings, input: InputState, layer: number, enabled = true) {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const wake = () => {
      setFaded(false);
      window.clearTimeout(timer);
      if (enabled && settings.autoFade && input.pressedPositions.length === 0) {
        timer = window.setTimeout(() => setFaded(true), settings.autoFadeDelay * 1000);
      }
    };
    wake();
    const events = ["pointermove", "pointerdown", "keydown", "focus"];
    events.forEach((name) => window.addEventListener(name, wake));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, wake));
    };
  }, [enabled, settings.autoFade, settings.autoFadeDelay, input, layer]);
  return faded;
}
