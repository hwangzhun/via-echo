import { StatusIndicator } from "./StatusIndicator";
import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GearIcon, MinusIcon, XIcon } from "./icons";
import { statusText } from "./model";
import type { DeviceStatus } from "./types";

interface Props {
  status: DeviceStatus;
  children?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  onConfigure?: () => void;
  onError: (message: string) => void;
}

export function WindowTitlebar({ status, children, onClose, closeLabel, onConfigure, onError }: Props) {
  const run = (operation: Promise<unknown>) => { void operation.catch((error) => onError(String(error))); };
  return <header className="topbar" onPointerDown={(event) => {
    event.stopPropagation();
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    run(getCurrentWindow().startDragging());
  }}>
    <div className="brand"><StatusIndicator status={status} /><span className="brand-name">viaecho</span><span className="status-copy">{statusText(status)}</span></div>
    <div className="titlebar-context">{children}</div>
    <div className="window-actions">
      {onConfigure && <button aria-label="打开配置" title="打开配置" onClick={onConfigure}><GearIcon aria-hidden="true" /></button>}
      <button aria-label="最小化" title="最小化" onClick={() => run(getCurrentWindow().minimize())}><MinusIcon aria-hidden="true" /></button>
      <button className="close-button" aria-label={closeLabel} title={closeLabel} onClick={onClose}><XIcon aria-hidden="true" /></button>
    </div>
  </header>;
}
