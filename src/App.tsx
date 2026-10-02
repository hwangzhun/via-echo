import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { bindingText, resolveEncoder, resolveKey, statusText } from "./model";
import type { AppSettings, DeviceState, InputState, KeyBinding, LayoutData } from "./types";

const DEFAULT_DEVICE: DeviceState = {
  status: "connecting",
  activeLayer: 0,
  layers: [],
  encoders: [],
  cachedAt: null,
  message: "正在查找 DOIO KB16…",
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  opacity: 0.92,
  autoFade: true,
  fadedOpacity: 0.42,
  alwaysOnTop: true,
  clickThrough: false,
  launchAtLogin: false,
  customLabels: {},
};

interface LabelEditor {
  id: string;
  original: string;
}

function withSettingDefaults(settings: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    customLabels: settings.customLabels ?? {},
  };
}

function App() {
  const [layout, setLayout] = useState<LayoutData | null>(null);
  const [device, setDevice] = useState<DeviceState>(DEFAULT_DEVICE);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState<InputState>({ pressedPositions: [], encoderDeltas: [] });
  const [previewLayer, setPreviewLayer] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelEditor, setLabelEditor] = useState<LabelEditor | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [isFaded, setIsFaded] = useState(false);
  const [encoderFlash, setEncoderFlash] = useState<Record<string, "ccw" | "cw">>({});
  const flashTimers = useRef<Record<string, number>>({});

  const liveLayer = device.status === "connected" ? device.activeLayer : previewLayer;
  const pressed = useMemo(
    () => new Set(input.pressedPositions.map(({ row, col }) => `${row},${col}`)),
    [input.pressedPositions],
  );

  useEffect(() => {
    document.documentElement.style.setProperty("--window-opacity", String(settings.opacity));
    document.documentElement.style.setProperty("--faded-opacity", String(settings.fadedOpacity));
  }, [settings.opacity, settings.fadedOpacity]);

  useEffect(() => {
    if (!settings.autoFade || settingsOpen || editingLabels || labelEditor) {
      setIsFaded(false);
      return;
    }
    let timer = window.setTimeout(() => setIsFaded(true), 2800);
    const wake = () => {
      setIsFaded(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsFaded(true), 2800);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("focus", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("focus", wake);
    };
  }, [settings.autoFade, settingsOpen, editingLabels, labelEditor]);

  useEffect(() => {
    if (!editingLabels) return;
    const leaveEditing = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (labelEditor) setLabelEditor(null);
      else setEditingLabels(false);
    };
    window.addEventListener("keydown", leaveEditing);
    return () => window.removeEventListener("keydown", leaveEditing);
  }, [editingLabels, labelEditor]);

  useEffect(() => {
    Promise.all([
      invoke<LayoutData>("get_layout"),
      invoke<DeviceState>("get_initial_state"),
      invoke<AppSettings>("get_settings"),
    ])
      .then(([nextLayout, nextDevice, nextSettings]) => {
        setLayout(nextLayout);
        setDevice(nextDevice);
        setPreviewLayer(nextDevice.activeLayer);
        setSettings(withSettingDefaults(nextSettings));
      })
      .catch((error) => setDevice((current) => ({ ...current, status: "error", message: String(error) })));

    const unlistenDevice = listen<DeviceState>("device-state", ({ payload }) => {
      setDevice(payload);
      if (payload.status === "connected") setPreviewLayer(payload.activeLayer);
    });
    const unlistenInput = listen<InputState>("input-state", ({ payload }) => {
      setInput(payload);
      for (const delta of payload.encoderDeltas) {
        const direction = delta.steps < 0 ? "ccw" : "cw";
        setEncoderFlash((current) => ({ ...current, [delta.id]: direction }));
        window.clearTimeout(flashTimers.current[delta.id]);
        flashTimers.current[delta.id] = window.setTimeout(() => {
          setEncoderFlash((current) => {
            const next = { ...current };
            delete next[delta.id];
            return next;
          });
        }, 180);
      }
    });
    const unlistenSettings = listen<AppSettings>("settings-changed", ({ payload }) => setSettings(withSettingDefaults(payload)));

    return () => {
      void unlistenDevice.then((unlisten) => unlisten());
      void unlistenInput.then((unlisten) => unlisten());
      void unlistenSettings.then((unlisten) => unlisten());
      Object.values(flashTimers.current).forEach(window.clearTimeout);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let tray: TrayIcon | undefined;
    let unlistenClose: (() => void) | undefined;
    const setupDesktop = async () => {
      const appWindow = getCurrentWindow();
      await appWindow.setSkipTaskbar(false);
      unlistenClose = await appWindow.onCloseRequested((event) => {
        event.preventDefault();
        void invoke("exit_app");
      });
      const menu = await Menu.new({
        items: [
          {
            id: "toggle",
            text: "显示 / 隐藏",
            action: async () => {
              if (await appWindow.isMinimized()) {
                await appWindow.unminimize();
                await appWindow.show();
                await appWindow.setFocus();
              } else if (await appWindow.isVisible()) await appWindow.hide();
              else {
                await appWindow.show();
                await appWindow.setFocus();
              }
            },
          },
          {
            id: "unlock",
            text: "解除鼠标穿透",
            action: async () => {
              await invoke("unlock_window");
              await appWindow.show();
              if (await appWindow.isMinimized()) await appWindow.unminimize();
              await appWindow.setFocus();
            },
          },
          {
            id: "refresh",
            text: "刷新 VIA 键位",
            action: () => invoke("refresh_keymap"),
          },
          {
            id: "settings",
            text: "设置",
            action: async () => {
              await invoke("unlock_window");
              await appWindow.show();
              if (await appWindow.isMinimized()) await appWindow.unminimize();
              await appWindow.setFocus();
              setSettingsOpen(true);
            },
          },
          {
            id: "quit",
            text: "退出 VIA Echo",
            action: () => invoke("exit_app"),
          },
        ],
      });
      const created = await TrayIcon.new({
        id: "via-echo-tray",
        menu,
        tooltip: "VIA Echo · DOIO KB16",
        showMenuOnLeftClick: false,
        action: async (event) => {
          if (event.type !== "Click" || event.button !== "Left" || event.buttonState !== "Up") return;
          await invoke("unlock_window");
          await appWindow.show();
          if (await appWindow.isMinimized()) await appWindow.unminimize();
          await appWindow.setFocus();
        },
      });
      if (disposed) await created.close();
      else tray = created;
    };
    void setupDesktop();
    return () => {
      disposed = true;
      unlistenClose?.();
      if (tray) void tray.close();
    };
  }, []);

  const saveSettings = async (patch: Partial<AppSettings>) => {
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    try {
      setSettings(withSettingDefaults(await invoke<AppSettings>("update_settings", { settings: optimistic })));
    } catch (error) {
      setDevice((current) => ({ ...current, message: String(error) }));
    }
  };

  const openLabelEditor = (id: string, binding: KeyBinding, original = binding.displayLabel) => {
    if (!editingLabels) return;
    const current = (settings.customLabels ?? {})[id] ?? binding.displayLabel;
    setLabelEditor({ id, original });
    setLabelDraft(current);
  };

  const commitLabel = async (reset = false) => {
    if (!labelEditor) return;
    const customLabels = { ...(settings.customLabels ?? {}) };
    const value = labelDraft.trim().slice(0, 24);
    if (reset || !value || value === labelEditor.original) delete customLabels[labelEditor.id];
    else customLabels[labelEditor.id] = value;
    setLabelEditor(null);
    await saveSettings({ customLabels });
  };

  const namedBinding = (id: string, binding: KeyBinding): KeyBinding => {
    const label = (settings.customLabels ?? {})[id];
    return label ? { ...binding, displayLabel: label, icon: null } : binding;
  };

  if (!layout) {
    return <div className="loading-shell">正在启动 VIA Echo…</div>;
  }

  return (
    <div className={`app-shell theme-${settings.theme} ${isFaded ? "idle-faded" : ""} ${editingLabels ? "editing-labels" : ""}`}>
      <header className="topbar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className={`status-dot ${device.status}`} aria-hidden="true" />
          <span className="brand-name">VIA Echo</span>
          <span className="status-copy">{statusText(device.status)}</span>
        </div>
        <nav className="layer-tabs" aria-label="键盘层">
          {[0, 1, 2, 3].map((layer) => (
            <button
              key={layer}
              className={liveLayer === layer ? "active" : ""}
              disabled={device.status === "connected"}
              onClick={() => setPreviewLayer(layer)}
              title={device.status === "connected" ? "已跟随键盘当前层" : `预览第 ${layer + 1} 层`}
            >
              L{layer + 1}
            </button>
          ))}
        </nav>
        <div className="window-actions">
          <button onClick={() => setSettingsOpen((open) => !open)} aria-label="设置" title="设置">⚙</button>
          <button onClick={() => void getCurrentWindow().minimize()} aria-label="最小化" title="最小化">−</button>
          <button className="close-button" onClick={() => void invoke("exit_app")} aria-label="退出" title="退出 VIA Echo">×</button>
        </div>
      </header>

      <main className="workspace">
        <div className="keyboard-stage" style={{ aspectRatio: `${layout.width} / ${layout.height}` }}>
          {layout.keys.map((key) => {
            const labelId = `key:${liveLayer}:${key.row}:${key.col}`;
            const resolved = resolveKey(device.layers, liveLayer, key.row, key.col, layout.cols);
            const binding = namedBinding(labelId, resolved);
            const active = pressed.has(`${key.row},${key.col}`);
            return (
              <div
                key={`${key.row},${key.col}`}
                className={`keycap ${active ? "pressed" : ""} ${binding.rawCode === 0 ? "empty" : ""}`}
                style={rectStyle(key, layout)}
                title={`${binding.displayLabel} · ${binding.qmkName}`}
                onClick={() => openLabelEditor(labelId, binding, resolved.displayLabel)}
              >
                {binding.icon && <span className="binding-icon">{binding.icon}</span>}
                <span className="binding-label">{bindingText(binding)}</span>
              </div>
            );
          })}

          {layout.encoders.map((encoder, encoderIndex) => {
            const resolved = resolveEncoder(device.encoders, liveLayer, encoderIndex);
            const ids = {
              press: `encoder:${liveLayer}:${encoderIndex}:press`,
              ccw: `encoder:${liveLayer}:${encoderIndex}:ccw`,
              cw: `encoder:${liveLayer}:${encoderIndex}:cw`,
            };
            const binding = {
              ...resolved,
              press: namedBinding(ids.press, resolved.press),
              counterClockwise: namedBinding(ids.ccw, resolved.counterClockwise),
              clockwise: namedBinding(ids.cw, resolved.clockwise),
            };
            const active = pressed.has(`${encoder.row},${encoder.col}`);
            const flash = encoderFlash[encoder.id];
            return (
              <div key={encoder.id} className={`encoder-unit ${encoder.id}`} style={rectStyle(encoder, layout)}>
                <div className={`encoder-direction ccw ${flash === "ccw" ? "flash" : ""}`} title={binding.counterClockwise.qmkName} onClick={() => openLabelEditor(ids.ccw, binding.counterClockwise, resolved.counterClockwise.displayLabel)}>
                  <span>←</span><small>{bindingText(binding.counterClockwise)}</small>
                </div>
                <div className={`encoder-knob ${active ? "pressed" : ""}`} title={`${binding.press.displayLabel} · ${binding.press.qmkName}`} onClick={() => openLabelEditor(ids.press, binding.press, resolved.press.displayLabel)}>
                  <i aria-hidden="true" />
                  <small>{bindingText(binding.press)}</small>
                </div>
                <div className={`encoder-direction cw ${flash === "cw" ? "flash" : ""}`} title={binding.clockwise.qmkName} onClick={() => openLabelEditor(ids.cw, binding.clockwise, resolved.clockwise.displayLabel)}>
                  <span>→</span><small>{bindingText(binding.clockwise)}</small>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="statusbar" title={device.message ?? undefined}>
        <span>L{liveLayer + 1}</span>
        <span className="status-message">{device.message ?? "键位与当前层实时同步"}</span>
        <button onClick={() => void invoke("refresh_keymap")} disabled={device.status === "offline" || device.status === "connecting"}>
          刷新
        </button>
      </footer>

      {settingsOpen && (
        <section className="settings-panel" aria-label="设置">
          <div className="settings-heading">
            <div><strong>悬浮窗设置</strong><small>关闭窗口会完全退出，托盘左键可恢复窗口</small></div>
            <button onClick={() => setSettingsOpen(false)} aria-label="关闭设置">×</button>
          </div>
          <div className="theme-setting" aria-label="界面皮肤">
            <span>界面皮肤</span>
            <div>
              <button className={settings.theme === "dark" ? "active" : ""} onClick={() => void saveSettings({ theme: "dark" })}>深色</button>
              <button className={settings.theme === "light" ? "active" : ""} onClick={() => void saveSettings({ theme: "light" })}>亮色</button>
            </div>
          </div>
          <label className="range-setting">
            <span>透明度 <b>{Math.round(settings.opacity * 100)}%</b></span>
            <input
              type="range"
              min="0.35"
              max="1"
              step="0.05"
              value={settings.opacity}
              onChange={(event) => void saveSettings({ opacity: Number(event.target.value) })}
            />
          </label>
          <Toggle label="闲置 2.8 秒后自动变淡" checked={settings.autoFade} onChange={(value) => void saveSettings({ autoFade: value })} />
          {settings.autoFade && (
            <label className="range-setting compact-range">
              <span>变淡强度 <b>{Math.round(settings.fadedOpacity * 100)}%</b></span>
              <input
                type="range"
                min="0.15"
                max={settings.opacity}
                step="0.05"
                value={settings.fadedOpacity}
                onChange={(event) => void saveSettings({ fadedOpacity: Number(event.target.value) })}
              />
            </label>
          )}
          <Toggle label="始终置顶" checked={settings.alwaysOnTop} onChange={(value) => void saveSettings({ alwaysOnTop: value })} />
          <Toggle label="Windows 登录时启动" checked={settings.launchAtLogin} onChange={(value) => void saveSettings({ launchAtLogin: value })} />
          <Toggle label="锁定并穿透鼠标" checked={settings.clickThrough} onChange={(value) => void saveSettings({ clickThrough: value })} />
          <button
            className={`label-edit-button ${editingLabels ? "active" : ""}`}
            onClick={() => {
              setEditingLabels((value) => !value);
              setSettingsOpen(false);
            }}
          >
            {editingLabels ? "完成键名编辑" : "手动设置键位名称"}
          </button>
          <p className="settings-note">键名按层独立保存。鼠标穿透不会带到下次启动，也可用托盘左键解锁。</p>
        </section>
      )}

      {editingLabels && (
        <div className="edit-toolbar">
          <span><b>键名编辑中</b>· 点击键帽、旋钮或旋转方向</span>
          <button onClick={() => { setLabelEditor(null); setEditingLabels(false); }}>完成</button>
        </div>
      )}

      {labelEditor && (
        <div className="label-editor-layer">
          <form className="label-dialog" onSubmit={(event) => { event.preventDefault(); void commitLabel(); }}>
            <strong>设置键位名称</strong>
            <small>原名：{labelEditor.original}</small>
            <input
              autoFocus
              maxLength={24}
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              placeholder="输入自定义名称"
            />
            <div>
              <button type="button" className="reset-label" onClick={() => void commitLabel(true)}>恢复原名</button>
              <span />
              <button type="button" onClick={() => setLabelEditor(null)}>取消</button>
              <button type="submit" className="primary">保存</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-setting">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function rectStyle(
  rect: { x: number; y: number; w: number; h: number },
  layout: LayoutData,
): React.CSSProperties {
  return {
    left: `${(rect.x / layout.width) * 100}%`,
    top: `${(rect.y / layout.height) * 100}%`,
    width: `${(rect.w / layout.width) * 100}%`,
    height: `${(rect.h / layout.height) * 100}%`,
  };
}

export default App;
