import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WindowTitlebar } from "./WindowTitlebar";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppState, useTheme } from "./state";
import { Overlay } from "./Overlay";
import { SettingsWindow } from "./SettingsWindow";

const configuration = new URLSearchParams(window.location.search).get("window") === "settings";
export default function App() {
  const state = useAppState();
  const [windowError, setWindowError] = useState<string | null>(null);
  useTheme(state.settings);
  useEffect(() => {
    if (!configuration || state.ready) return;
    let disposed = false;
    let off: (() => void) | undefined;
    void listen("settings-close-requested", () => { void getCurrentWindow().hide(); }).then((cleanup) => {
      if (disposed) cleanup(); else off = cleanup;
    });
    return () => { disposed = true; off?.(); };
  }, [state.ready]);
  if (!state.ready) return <div className={`loading-shell theme-${state.settings.theme} ${configuration ? "configuration-loading" : ""}`}>
    <WindowTitlebar status={state.device.status} closeLabel={configuration ? "关闭配置" : "退出 viaecho"}
      onClose={() => { void (configuration ? getCurrentWindow().hide() : invoke("exit_app")).catch((error) => setWindowError(String(error))); }}
      onError={setWindowError}>{configuration ? "配置" : "启动中"}</WindowTitlebar>
    <div className="loading-content">{windowError && <p role="alert">{windowError}</p>}{state.error ? <div role="alert"><h2>无法启动 viaecho</h2><p>{state.error}</p><button onClick={state.retry}>重试</button></div> : <p>正在启动 viaecho…</p>}</div>
  </div>;
  return configuration ? <SettingsWindow state={state} /> : <Overlay state={state} />;
}
