import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import type { LayoutData, KeymapData, KeyEventPayload } from "./types";

function App() {
  const [layout, setLayout] = useState<LayoutData | null>(null);
  const [keymap, setKeymap] = useState<KeymapData | null>(null);
  const [currentLayer, setCurrentLayer] = useState(0);
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(new Set());
  const [keyboardConnected, setKeyboardConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [opacity, setOpacity] = useState(0.92);

  // 系统托盘 + 关闭时隐藏到托盘
  useEffect(() => {
    let unlistenClose: (() => void) | null = null;
    const setup = async () => {
      const win = getCurrentWindow();
      unlistenClose = await win.onCloseRequested((ev) => {
        ev.preventDefault();
        win.hide();
      });
      const menu = await Menu.new({
        items: [
          {
            id: "toggle",
            text: "显示/隐藏",
            action: async () => {
              const w = getCurrentWindow();
              const visible = await w.isVisible();
              if (visible) w.hide();
              else w.show();
            },
          },
          {
            id: "quit",
            text: "退出",
            action: () => invoke("exit_app"),
          },
        ],
      });
      await TrayIcon.new({ menu, tooltip: "VIA 键盘 Hub" });
    };
    setup().catch(console.error);
    return () => {
      unlistenClose?.();
    };
  }, []);

  useEffect(() => {
    getCurrentWindow().setAlwaysOnTop(alwaysOnTop);
  }, [alwaysOnTop]);

  useEffect(() => {
    document.documentElement.style.setProperty("--window-opacity", String(opacity));
  }, [opacity]);

  useEffect(() => {
    invoke("set_layer", { layer: currentLayer });
  }, [currentLayer]);

  useEffect(() => {
    invoke<LayoutData>("get_layout")
      .then(setLayout)
      .catch((e) => setError(String(e)));
    invoke<KeymapData | null>("load_keymap_from_cache")
      .then((data) => {
        if (data) setKeymap(data);
      })
      .catch(() => {});
  }, []);

  const loadKeymap = () => {
    setError(null);
    invoke<KeymapData | null>("load_keymap_from_keyboard")
      .then((data) => {
        if (data) {
          setKeymap(data);
          setKeyboardConnected(true);
        } else {
          setKeymap(null);
          setKeyboardConnected(false);
          setError("未检测到键盘或读取失败");
        }
      })
      .catch((e) => {
        setKeymap(null);
        setKeyboardConnected(false);
        setError(String(e));
      });
  };

  const loadKeymapFromCache = () => {
    setError(null);
    invoke<KeymapData | null>("load_keymap_from_cache")
      .then((data) => {
        if (data) {
          setKeymap(data);
          setKeyboardConnected(false);
        } else {
          setError("无缓存或读取失败");
        }
      })
      .catch((e) => {
        setError(String(e));
      });
  };

  useEffect(() => {
    const unlisten = listen<KeyEventPayload>("key-event", (event) => {
      const { row, col, pressed } = event.payload;
      const key = `${row},${col}`;
      setHighlightedKeys((prev) => {
        const next = new Set(prev);
        if (pressed) next.add(key);
        else next.delete(key);
        return next;
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const getKeycodeAt = (row: number, col: number): string => {
    if (!keymap || currentLayer >= keymap.layers.length) return "—";
    const layer = keymap.layers[currentLayer];
    const idx = row * keymap.cols + col;
    if (idx >= layer.length) return "—";
    return layer[idx] ?? "—";
  };

  if (error && !layout) {
    return (
      <div className="app error">
        <p>{error}</p>
        <p>请确保 kb12-02.json 已放在 src-tauri/resources/ 下。</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1 data-tauri-drag-region>VIA 键盘 Hub — {layout?.name ?? "KB12-02"}</h1>
        <div className="toolbar">
          <label className="toolbar-opt">
            <input
              type="checkbox"
              checked={alwaysOnTop}
              onChange={(e) => setAlwaysOnTop(e.target.checked)}
            />
            始终置顶
          </label>
          <label className="toolbar-opt">
            透明度
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <span className="opacity-value">{Math.round(opacity * 100)}%</span>
          </label>
          <button type="button" onClick={loadKeymap}>
            {keyboardConnected ? "重新从键盘加载" : "从键盘加载键位"}
          </button>
          <button type="button" onClick={loadKeymapFromCache}>
            从缓存加载
          </button>
          <label>
            层
            <select
              value={currentLayer}
              onChange={(e) => setCurrentLayer(Number(e.target.value))}
            >
              {[0, 1, 2, 3].map((i) => (
                <option key={i} value={i}>
                  Layer {i}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="error-msg">{error}</p>}
        {keyboardConnected && !keymap && <p className="hint">已连接，键位加载中…</p>}
      </header>

      <main className="hub">
        {layout && (
          <div
            className="keyboard"
            style={{
              width: layout.width,
              height: layout.height,
            }}
          >
            {layout.keys.map((k) => (
              <div
                key={`${k.row},${k.col}`}
                className={`key ${highlightedKeys.has(`${k.row},${k.col}`) ? "highlight" : ""}`}
                style={{
                  left: k.x,
                  top: k.y,
                  width: k.w,
                  height: k.h,
                }}
                title={`${k.row},${k.col} · ${getKeycodeAt(k.row, k.col)}`}
              >
                <span className="key-label">{getKeycodeAt(k.row, k.col)}</span>
              </div>
            ))}
            {layout.encoders.map((e) => (
              <div
                key={e.id}
                className="encoder"
                style={{
                  left: e.x,
                  top: e.y,
                  width: e.w,
                  height: e.h,
                }}
                title={`旋钮 ${e.id}`}
              >
                <span>{e.id}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
