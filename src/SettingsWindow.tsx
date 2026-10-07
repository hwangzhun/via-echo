import { StatusIndicator } from "./StatusIndicator";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowTitlebar } from "./WindowTitlebar";
import { KeyboardIcon, SlidersHorizontalIcon, InfoIcon, CursorClickIcon, ArrowSquareOutIcon } from "./icons";
import packageInfo from "../package.json";
import { Keyboard, LayerTabs, type Selection } from "./Keyboard";
import { connectionState, resolveEncoder, resolveKey, statusText } from "./model";
import { DEFAULT_SETTINGS, type AppState } from "./state";
import type { SettingsPatch } from "./types";

type Page = "labels" | "appearance" | "device";
const pageIcons = [KeyboardIcon, SlidersHorizontalIcon, InfoIcon];
const pages: [Page, string][] = [["labels", "键位名称"], ["appearance", "悬浮窗"], ["device", "设备与关于"]];
export function SettingsWindow({ state }: { state: AppState }) {
  const { settings, device, layout, input, refresh, saveSettings } = state;
  const [page, setPage] = useState<Page>("labels");
  const [layer, setLayer] = useState(device.activeLayer);
  const [selected, setSelection] = useState<Selection | null>(null);
  const selection = selected ? { ...selected, binding: currentBinding(selected, state) } : null;
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [settingError, setSettingError] = useState<string | null>(null);
  const failedPatch = useRef<SettingsPatch | null>(null);
  const dirty = selection !== null && draft !== baseline;
  const storedName = selection ? settings.customLabels[selection.id] ?? selection.binding.displayLabel : "";
  useEffect(() => {
    // A refreshed mapping updates the inspector unless the user has an unsaved draft.
    if (!dirty && !saving) { setDraft(storedName); setBaseline(storedName); }
  }, [storedName, dirty, saving]);
  const guard = (action: () => void) => {
    if (saving) return;
    if (dirty) setPending(() => action); else action();
  };
  const closeRef = useRef(() => {});
  closeRef.current = () => guard(() => { void getCurrentWindow().hide().catch((e) => setSettingError(String(e))); });
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    void listen("settings-close-requested", () => closeRef.current()).then((cleanup) => {
      if (disposed) cleanup(); else off = cleanup;
    }).catch((e) => setSettingError(String(e)));
    return () => { disposed = true; off?.(); };
  }, []);

  const select = (next: Selection) => {
    setSelection(next);
    const value = settings.customLabels[next.id] ?? next.binding.displayLabel;
    setDraft(value); setBaseline(value); setLabelError(null); setNotice(null);
  };
  const clearSelection = () => { setSelection(null); setDraft(""); setBaseline(""); setLabelError(null); setNotice(null); };
  const commit = async (reset = false) => {
    if (!selection || saving) return false;
    setSaving(true); setLabelError(null); setNotice(null);
    const value = Array.from(draft.trim()).slice(0, 24).join("");
    const label = reset || !value || value === selection.binding.displayLabel ? null : value;
    try {
      const result = await saveSettings({ customLabels: { [selection.id]: label } });
      const saved = result.customLabels[selection.id] ?? selection.binding.displayLabel;
      setDraft(saved); setBaseline(saved); setNotice(reset ? "已恢复原名" : "已保存");
      return true;
    } catch (error) { setLabelError(String(error)); return false; }
    finally { setSaving(false); }
  };
  const patch = async (value: SettingsPatch) => {
    setSettingError(null);
    try { await saveSettings(value); failedPatch.current = null; }
    catch (error) { failedPatch.current = value; setSettingError(String(error)); }
  };
  const refreshKeymap = () => { void invoke("refresh_keymap").catch((error) => setSettingError(String(error))); };

  return <div className={`configuration theme-${settings.theme}`}>
    <WindowTitlebar status={device.status} onError={setSettingError} closeLabel="关闭配置" onClose={() => closeRef.current()}>配置</WindowTitlebar>
    <aside className="config-sidebar">
      <div className="sidebar-heading">工作台</div>
      <nav aria-label="配置导航">{pages.map(([id, title], index) => { const Icon = pageIcons[index]; return <button key={id} className={page === id ? "active" : ""} aria-current={page === id ? "page" : undefined} onClick={() => guard(() => { clearSelection(); setPage(id); })}><Icon aria-hidden="true" />{title}</button>; })}</nav>
      <div className="sidebar-device"><StatusIndicator status={device.status} /><strong>DOIO KB16</strong><small>{statusText(device.status)}</small></div>
    </aside>
    <main className={`config-content ${page === "labels" ? "labels-page" : ""}`}>
      <header className="page-heading"><div><small>viaecho / 配置</small><h1>{pages.find(([id]) => id === page)?.[1]}</h1><p>{page === "labels" ? "选择一个按键或旋钮动作，设置你熟悉的名称。" : page === "appearance" ? "让悬浮提示适合你的桌面与工作习惯。" : "查看设备连接、同步状态与应用信息。"}</p></div></header>
      {settingError && <div role="alert" className="error-banner">{settingError}<div>{failedPatch.current && <button onClick={() => void patch(failedPatch.current!)}>重试</button>}<button onClick={() => setSettingError(null)}>关闭</button></div></div>}
      {page === "labels" && <>
        <div className="preview-heading"><LayerTabs layer={layer} onChange={(next) => { if (next !== layer) guard(() => { clearSelection(); setLayer(next); }); }} /><span>{device.status === "connected" ? `键盘当前 L${device.activeLayer + 1} · ${layer === device.activeLayer ? "实时反馈" : "正在预览"}` : device.layers.length ? "缓存 / 手动预览" : "尚未读取键位"}</span></div>
        <div className="label-workspace">
          <section className="keyboard-card"><div className="card-caption"><strong>DOIO KB16</strong><span>L{layer + 1} · 显示名称</span></div>
            <div className="config-keyboard workspace">{layout && <Keyboard layout={layout} device={device} settings={settings} input={input} layer={layer} selected={selection?.id} onSelect={device.layers.length ? (next) => { if (next.id !== selection?.id) guard(() => select(next)); } : undefined} />}</div>
            <p className="keyboard-help">{device.layers.length ? "点击键帽、旋钮或下方的旋转方向进行编辑" : "连接键盘后自动读取；已有缓存时可离线编辑"}</p>
          </section>
          <aside className="inspector">{selection ? <form onSubmit={(event) => { event.preventDefault(); void commit(); }}>
            <span className="eyebrow">L{layer + 1} / 显示名称</span><h2>{selection.title}</h2>
            <dl><dt>原始名称</dt><dd>{selection.binding.displayLabel}</dd><dt>QMK 标识</dt><dd><code>{selection.binding.qmkName}</code></dd></dl>
            <label className="name-field">自定义名称<input aria-label="自定义名称" value={draft} disabled={saving} onChange={(e) => { setDraft(Array.from(e.target.value).slice(0, 24).join("")); setNotice(null); }} /></label>
            <div className="field-hint"><span>仅修改显示名称</span><span>{Array.from(draft).length}/24</span></div>
            <div className="editor-buttons"><button className="primary" type="submit" disabled={saving || !dirty}>{saving ? "保存中…" : "保存"}</button><button type="button" disabled={saving || !dirty} onClick={() => { setDraft(baseline); setLabelError(null); }}>取消</button></div>
            <button className="text-button" type="button" disabled={saving || !settings.customLabels[selection.id]} onClick={() => void commit(true)}>恢复原名</button>
            {labelError && <p role="alert" className="error-text">保存失败：{labelError}。草稿已保留，请重试。</p>}{notice && <p role="status" className="success-text">{notice}</p>}
          </form> : <div className="inspector-empty"><CursorClickIcon className="empty-icon" aria-hidden="true" /><h2>选择一个动作</h2><p>名称按层独立保存。预览其他层不会改变键盘的实际层。</p></div>}</aside>
        </div>
        <p className="info-note">实际按键功能请在 VIA 中修改，修改后前往“设备与关于”刷新键位。</p>
      </>}
      {page === "appearance" && <div className="preferences">
        <section className="preference-card"><h2>外观</h2>
          <div className="theme-setting"><span>界面皮肤</span><div>{(["dark", "light"] as const).map((theme) => <button key={theme} className={settings.theme === theme ? "active" : ""} onClick={() => void patch({ theme })}>{theme === "dark" ? "深色" : "亮色"}</button>)}</div></div>
          <div className="color-setting"><label htmlFor="accent">主题强调色</label><div><input id="accent" type="color" value={settings.accentColor} onChange={(e) => void patch({ accentColor: e.target.value })} /><code>{settings.accentColor}</code><button onClick={() => void patch({ accentColor: DEFAULT_SETTINGS.accentColor })}>默认</button></div></div>
          <Range label="悬浮窗透明度" value={settings.opacity} min={.35} max={1} step={.05} format={percent} onChange={(opacity) => void patch({ opacity })} />
        </section>
        <section className="preference-card"><h2>自动变淡</h2><Toggle label="闲置后自动变淡" checked={settings.autoFade} onChange={(autoFade) => void patch({ autoFade })} />
          {settings.autoFade && <><Range label="等待时间" value={settings.autoFadeDelay} min={1} max={30} step={.1} format={(n) => `${n.toFixed(1)} 秒`} onChange={(autoFadeDelay) => void patch({ autoFadeDelay })} /><Range label="变淡后不透明度" value={settings.fadedOpacity} min={.15} max={settings.opacity} step={.05} format={percent} onChange={(fadedOpacity) => void patch({ fadedOpacity })} /></>}
          <p className="info-note">操作 KB16、切换层或移动鼠标即可恢复清晰。按住按键期间不会变淡。</p>
        </section>
        <section className="preference-card"><h2>窗口与启动</h2><Toggle label="悬浮窗始终置顶" checked={settings.alwaysOnTop} onChange={(alwaysOnTop) => void patch({ alwaysOnTop })} /><Toggle label="锁定悬浮窗并穿透鼠标" checked={settings.clickThrough} onChange={(clickThrough) => void patch({ clickThrough })} /><p className="info-note">可从托盘解除穿透；配置窗始终可操作。下次启动自动解除穿透。</p><Toggle label="登录时启动" checked={settings.launchAtLogin} onChange={(launchAtLogin) => void patch({ launchAtLogin })} /><p className="info-note">关闭悬浮窗会退出应用；关闭此配置窗不会退出。</p></section>
      </div>}
      {page === "device" && <div className="device-page"><section className="preference-card"><div className="device-heading"><div><span className="eyebrow">连接的设备</span><h2>DOIO KB16-01</h2></div><span className={`status-pill ${connectionState(device.status)}`}>{statusText(device.status)}</span></div>
        <dl className="device-details"><dt>实时遥测</dt><dd>{device.status === "connected" ? "可用 · 自动跟随当前层与输入" : device.status === "incompatible" ? "不可用 · 已读取键位，可手动预览" : "等待设备连接"}</dd><dt>键位缓存</dt><dd>{device.cachedAt ? new Date(device.cachedAt * 1000).toLocaleString("zh-CN") : "暂无缓存"}</dd><dt>连接详情</dt><dd>{device.message ?? "键位与当前层实时同步"}</dd></dl>
        <div className="refresh-row"><button className="primary" disabled={refresh.status === "running" || !["connected", "incompatible"].includes(device.status)} onClick={refreshKeymap}>{refresh.status === "running" ? "正在读取键位…" : "刷新 VIA 键位"}</button><span role={refresh.status === "error" ? "alert" : "status"} className={refresh.status === "error" ? "error-text" : "muted"}>{refresh.status === "running" ? "请稍候，正在从设备读取" : refresh.message}</span></div>
        {device.status === "incompatible" && <p className="info-note">原厂固件也可用于键位预览；自动跟层与输入反馈需要配套遥测固件。</p>}
      </section><section className="preference-card about-card"><img className="about-logo" src={new URL("../src-tauri/icons/icon.png", import.meta.url).href} alt="viaecho logo" /><div><span className="eyebrow">关于</span><h2>viaecho <small>v{packageInfo.version}</small></h2><p className="muted">DOIO KB16 的 VIA 键位与输入状态悬浮提示器。</p><button onClick={() => void invoke("open_repository").catch((e) => setSettingError(String(e)))}>GitHub 仓库 <ArrowSquareOutIcon aria-hidden="true" /></button><p className="info-note">作者 Hwangzhun</p></div></section></div>}
    </main>
    {pending && <div className="confirm-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" className="confirm-dialog" onKeyDown={(event) => {
      if (event.key === "Escape" && !saving) { event.preventDefault(); setPending(null); }
      if (event.key === "Tab") {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}><h2 id="unsaved-title">保存名称修改？</h2><p>当前名称尚未保存，选择如何继续。</p>{labelError && <p role="alert" className="error-text">{labelError}</p>}<div className="dialog-actions"><button autoFocus disabled={saving} onClick={() => setPending(null)}>取消</button><button disabled={saving} onClick={() => { setDraft(baseline); pending(); setPending(null); }}>放弃修改</button><button className="primary" disabled={saving} onClick={() => { void commit().then((ok) => { if (ok) { pending(); setPending(null); } }); }}>{saving ? "保存中…" : "保存并继续"}</button></div></section></div>}
  </div>;
}

function percent(value: number) { return `${Math.round(value * 100)}%`; }
function Range({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (n: number) => void }) {
  return <label className="range-setting"><span>{label}<b>{format(value)}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (n: boolean) => void }) {
  return <label className="toggle-setting"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><i aria-hidden="true" /></label>;
}

function currentBinding(selection: Selection, state: AppState) {
  const parts = selection.id.split(":");
  const layer = Number(parts[1]);
  if (parts[0] === "key") return resolveKey(state.device.layers, layer, Number(parts[2]), Number(parts[3]), state.layout?.cols);
  const encoder = resolveEncoder(state.device.encoders, layer, Number(parts[2]));
  return parts[3] === "press" ? encoder.press : parts[3] === "ccw" ? encoder.counterClockwise : encoder.clockwise;
}
