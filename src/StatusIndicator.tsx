import { connectionState } from "./model";
import type { DeviceStatus } from "./types";

export function StatusIndicator({ status }: { status: DeviceStatus }) {
  const state = connectionState(status);
  const label = { connected: "已连接", disconnected: "未连接", error: "连接错误" }[state];
  return <span className={`status-dot ${state}`} role="img" aria-label={label} title={label} />;
}
