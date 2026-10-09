import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Keyboard, LayerTabs } from "./Keyboard";
import { WindowTitlebar } from "./WindowTitlebar";
import { Y2kDisplay } from "./Y2kDisplay";
import { SpaceAgeDisplay } from "./SpaceAgeDisplay";
import { useAutoFade, type AppState } from "./state";

export function Overlay({ state }: { state: AppState }) {
  const { device, settings, input, layout } = state;
  const [previewLayer, setPreviewLayer] = useState(device.activeLayer);
  const [error, setError] = useState<string | null>(null);
  const live = device.status === "connected";
  const layer = live ? device.activeLayer : previewLayer;
  useEffect(() => { if (live) setPreviewLayer(device.activeLayer); }, [live, device.activeLayer]);
  const faded = useAutoFade(settings, input, layer, !error);
  const run = (operation: Promise<unknown>) => { void operation.catch((reason) => setError(String(reason))); };
  return <div className={`app-shell theme-${settings.theme} ${faded ? "idle-faded" : ""}`} onPointerDown={(event) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, a")) return;
    run(getCurrentWindow().startDragging());
  }}>
    <WindowTitlebar status={device.status} onError={setError} closeLabel="退出 viaecho"
      onClose={() => run(invoke("exit_app"))} onConfigure={() => run(invoke("open_settings"))}>
      <span className="current-layer">L{layer + 1}<small>{live ? "跟随键盘" : "手动预览"}</small></span>
    </WindowTitlebar>
    {settings.theme === "y2k" && <Y2kDisplay device={device} input={input} layer={layer} layout={layout} />}
    {settings.theme === "spaceAge" && <SpaceAgeDisplay device={device} input={input} layer={layer} layout={layout} />}
    <main className="workspace">{layout && <Keyboard layout={layout} device={device} settings={settings} input={input} layer={layer} />}</main>
    <footer className="overlay-footer">
      <span className="keyboard-model">键盘型号：{layout?.name ?? "未知"}</span>
      {!live && <LayerTabs layer={layer} onChange={setPreviewLayer} />}
    </footer>
    {error && <div role="alert" className="overlay-error">{error}<button onClick={() => setError(null)}>关闭</button></div>}
  </div>;
}
