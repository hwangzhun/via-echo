// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { mockIPC, clearMocks, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { SettingsWindow } from "./SettingsWindow";
import { Overlay } from "./Overlay";
import { DEFAULT_SETTINGS, useAppState, useAutoFade, type AppState } from "./state";
import type { DeviceState, InputState, SettingsPatch } from "./types";
import layout from "../src-tauri/resources/kb16-01.json";

const binding = { rawCode: 4, qmkName: "KC_A", displayLabel: "A", icon: null };
function device(): DeviceState {
  return {
    status: "connected", activeLayer: 0,
    layers: Array.from({ length: 4 }, (_, n) => Array.from({ length: 20 }, () => ({ ...binding, displayLabel: `动作${n + 1}` }))),
    encoders: Array.from({ length: 4 }, () => Array.from({ length: 3 }, (_, n) => ({ id: `e${n}`, press: binding, clockwise: binding, counterClockwise: binding }))),
  };
}
function appState(): AppState {
  return {
    layout, device: device(), settings: { ...DEFAULT_SETTINGS, customLabels: {} },
    input: { pressedPositions: [], encoderDeltas: [] }, refresh: { status: "idle" }, error: null, ready: true,
    retry: vi.fn(), saveSettings: vi.fn(async () => DEFAULT_SETTINGS),
  };
}
// The installed Tauri mock uses `id` for unlisten, while the actual API sends `eventId`.
function mockBackend(handler: Parameters<typeof mockIPC>[0]) {
  mockIPC(handler, { shouldMockEvents: true });
  const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } }).__TAURI_INTERNALS__;
  const original = internals.invoke;
  internals.invoke = (cmd, args) => original(cmd, cmd === "plugin:event|unlisten" ? { ...args, id: args?.eventId } : args);
}
let calls: string[];
beforeEach(() => {
  calls = [];
  mockWindows("settings");
  mockBackend((command) => { calls.push(command); });
});
afterEach(() => { cleanup(); clearMocks(); vi.useRealTimers(); });
const selectFirst = () => fireEvent.click(screen.getByRole("button", { name: /^第 1 行第 1 键/ }));
const typeName = (value: string) => fireEvent.change(screen.getByRole("textbox", { name: "自定义名称" }), { target: { value } });

describe("configuration editing", () => {
  it("previews any layer while connected and device changes never steal the edit", () => {
    const state = appState();
    const view = render(<SettingsWindow state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "L3" }));
    selectFirst(); typeName("剪辑");
    view.rerender(<SettingsWindow state={{ ...state, device: { ...state.device, activeLayer: 1 } }} />);
    expect(screen.getByRole("button", { name: "L3" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("剪辑");
    expect(screen.getByText("键盘当前 L2 · 正在预览")).toBeTruthy();
  });

  it("guards layer/action/navigation changes, and can cancel or discard", () => {
    render(<SettingsWindow state={appState()} />);
    selectFirst(); typeName("剪辑");
    fireEvent.click(screen.getByRole("button", { name: "L2" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "取消" }));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("剪辑");
    fireEvent.click(screen.getByRole("button", { name: /^旋钮 1 · 顺时针/ }));
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(screen.getByRole("heading", { name: "旋钮 1 · 顺时针" })).toBeTruthy();
    typeName("旋转");
    fireEvent.click(screen.getByRole("button", { name: /设备与关于/ }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("keeps draft on save failure and retries the same per-layer label patch", async () => {
    const state = appState();
    const save = vi.fn().mockRejectedValueOnce(new Error("磁盘写入失败")).mockResolvedValueOnce({ ...DEFAULT_SETTINGS, customLabels: { "key:0:0:0": "剪辑" } });
    render(<SettingsWindow state={{ ...state, saveSettings: save }} />);
    selectFirst(); typeName("剪辑");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("alert");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("剪辑");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByText("已保存");
    expect(save).toHaveBeenLastCalledWith({ customLabels: { "key:0:0:0": "剪辑" } });
  });

  it("saves before closing, and only hides the configuration window", async () => {
    const state = appState();
    state.saveSettings = vi.fn(async () => ({ ...DEFAULT_SETTINGS, customLabels: { "key:0:0:0": "剪辑" } }));
    render(<SettingsWindow state={state} />);
    selectFirst(); typeName("剪辑");
    await act(async () => { await emit("settings-close-requested"); });
    expect(calls).not.toContain("plugin:window|hide");
    fireEvent.click(screen.getByRole("button", { name: "保存并继续" }));
    await waitFor(() => expect(calls).toContain("plugin:window|hide"));
    expect(calls).not.toContain("exit_app");
  });

  it("uses the shared custom titlebar without bypassing the unsaved-draft guard", async () => {
    const view = render(<SettingsWindow state={appState()} />);
    const titlebar = view.container.querySelector(".topbar")!;
    fireEvent(titlebar, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(calls.filter((command) => command === "plugin:window|start_dragging")).toHaveLength(1);
    const minimize = screen.getByRole("button", { name: "最小化" });
    expect(minimize.querySelector("svg")).toBeTruthy();
    fireEvent(minimize.querySelector("svg")!, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    fireEvent.click(minimize);
    expect(calls).toContain("plugin:window|minimize");
    expect(calls.filter((command) => command === "plugin:window|start_dragging")).toHaveLength(1);
    selectFirst(); typeName("剪辑");
    fireEvent.click(screen.getByRole("button", { name: "关闭配置" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(calls).not.toContain("plugin:window|hide");
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(calls).toContain("plugin:window|hide"));
    expect(calls).not.toContain("exit_app");
  });

  it("restores only the selected label and respects a 24 Unicode character limit", async () => {
    const state = appState();
    state.settings.customLabels = { "key:0:0:0": "旧名", "key:1:0:0": "另一层" };
    render(<SettingsWindow state={state} />);
    selectFirst(); typeName("🎵".repeat(30));
    expect(Array.from((screen.getByRole("textbox") as HTMLInputElement).value)).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: "恢复原名" }));
    await waitFor(() => expect(state.saveSettings).toHaveBeenCalledWith({ customLabels: { "key:0:0:0": null } }));
  });

  it("does not show another layer's live input and clears it on disconnect", () => {
    const state = appState();
    state.input = { pressedPositions: [{ row: 0, col: 0 }], encoderDeltas: [{ id: "e0", steps: 1 }] };
    const view = render(<SettingsWindow state={state} />);
    expect(view.container.querySelectorAll(".pressed")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "L2" }));
    expect(view.container.querySelectorAll(".pressed, .flash")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "L1" }));
    view.rerender(<SettingsWindow state={{ ...state, device: { ...state.device, status: "offline" } }} />);
    expect(view.container.querySelectorAll(".pressed, .flash")).toHaveLength(0);
  });

  it("waits for actual refresh completion and displays errors", () => {
    const state = appState();
    const view = render(<SettingsWindow state={state} />);
    fireEvent.click(screen.getByRole("button", { name: /设备与关于/ }));
    fireEvent.click(screen.getByRole("button", { name: "刷新 VIA 键位" }));
    expect(calls).toContain("refresh_keymap");
    expect(screen.queryByText("键位已刷新")).toBeNull();
    view.rerender(<SettingsWindow state={{ ...state, refresh: { status: "running" } }} />);
    expect((screen.getByRole("button", { name: "正在读取键位…" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<SettingsWindow state={{ ...state, refresh: { status: "error", message: "设备读取失败" } }} />);
    expect(screen.getByRole("alert").textContent).toBe("设备读取失败");
    view.rerender(<SettingsWindow state={{ ...state, refresh: { status: "success", message: "键位已刷新" } }} />);
    expect(screen.getByRole("status").textContent).toBe("键位已刷新");
  });
});

describe("overlay and fading", () => {
  it("keeps the last live layer offline and permits manual previews", () => {
    const state = appState(); state.device.activeLayer = 2;
    const view = render(<Overlay state={state} />);
    view.rerender(<Overlay state={{ ...state, device: { ...state.device, status: "offline", activeLayer: 0 } }} />);
    expect(screen.getByRole("button", { name: "L3" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "L4" }));
    expect(screen.getByRole("button", { name: "L4" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "退出 viaecho" }));
    expect(calls).toContain("exit_app");
  });

  it("wakes for telemetry and layer changes, stays awake while held, fades after release", () => {
    vi.useFakeTimers();
    const empty: InputState = { pressedPositions: [], encoderDeltas: [] };
    const { result, rerender } = renderHook(({ input, layer }) => useAutoFade(DEFAULT_SETTINGS, input, layer), { initialProps: { input: empty, layer: 0 } });
    act(() => vi.advanceTimersByTime(2800)); expect(result.current).toBe(true);
    rerender({ input: { pressedPositions: [{ row: 0, col: 0 }], encoderDeltas: [] }, layer: 0 });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(60000)); expect(result.current).toBe(false);
    rerender({ input: empty, layer: 0 });
    act(() => vi.advanceTimersByTime(2800)); expect(result.current).toBe(true);
    rerender({ input: { ...empty, encoderDeltas: [{ id: "e0", steps: -1 }] }, layer: 0 }); expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(2800)); expect(result.current).toBe(true);
    rerender({ input: empty, layer: 1 }); expect(result.current).toBe(false);
  });
});

describe("shared app state", () => {
  it("recovers initialization errors, synchronizes windows, and serializes rapid patches", async () => {
    let failed = true;
    let settings = { ...DEFAULT_SETTINGS, customLabels: {} };
    const mutations: SettingsPatch[] = [];
    mockBackend(async (command, args) => {
      if (command === "get_layout") { if (failed) throw new Error("初始化失败"); return layout; }
      if (command === "get_initial_state") return device();
      if (command === "get_settings") return settings;
      if (command === "get_input_state") return { pressedPositions: [{ row: 0, col: 0 }], encoderDeltas: [] };
      if (command === "get_refresh_state") return { status: "idle" };
      if (command === "update_settings") {
        const patch = (args as { patch: SettingsPatch }).patch;
        mutations.push(patch);
        settings = { ...settings, ...patch, customLabels: settings.customLabels };
        await emit("settings-changed", settings);
        return settings;
      }
    });
    const first = renderHook(useAppState);
    await waitFor(() => expect(first.result.current.error).toContain("初始化失败"));
    failed = false;
    act(() => first.result.current.retry());
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.input.pressedPositions).toEqual([{ row: 0, col: 0 }]);
    const second = renderHook(useAppState);
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    await act(async () => {
      await Promise.all([first.result.current.saveSettings({ opacity: .7 }), first.result.current.saveSettings({ theme: "light" })]);
    });
    expect(mutations).toEqual([{ opacity: .7 }, { theme: "light" }]);
    expect(second.result.current.settings.theme).toBe("light");
    expect(second.result.current.settings.opacity).toBe(.7);
    await act(async () => { await emit("input-state", { pressedPositions: [{ row: 0, col: 0 }], encoderDeltas: [] }); await emit("device-state", { ...device(), status: "offline" }); });
    expect(first.result.current.input.pressedPositions).toEqual([]);
  });
});


describe("product presentation", () => {
  it("shows the model from layout metadata and keeps manual preview available offline", () => {
    const state = appState();
    render(<Overlay state={{ ...state, layout: { ...layout, name: "测试型号" }, device: { ...state.device, status: "offline" } }} />);
    expect(screen.getByText("键盘型号：测试型号")).toBeTruthy();
    expect(screen.getByRole("button", { name: "L4" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "未连接" })).toBeTruthy();
  });
  it("keeps devices without telemetry green and displays errors separately", () => {
    const state = appState();
    const view = render(<SettingsWindow state={{ ...state, device: { ...state.device, status: "incompatible" } }} />);
    expect(screen.getAllByRole("img", { name: "已连接" })).toHaveLength(2);
    view.rerender(<SettingsWindow state={{ ...state, device: { ...state.device, status: "error" } }} />);
    expect(screen.getAllByRole("img", { name: "连接错误" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /设备与关于/ }));
    expect(screen.getByRole("img", { name: "viaecho logo" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^viaecho/ })).toBeTruthy();
  });
});
