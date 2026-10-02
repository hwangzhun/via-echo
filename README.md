# VIA Echo

VIA Echo 是为 **DOIO KB16-01** 设计的 Windows 悬浮键位提示器。它会自动读取 VIA 中的四层键位，跟随键盘当前层，并实时反馈 16 个普通键和 3 个旋钮的按压/旋转操作。

> 正确的 QMK 目标是 `doio/kb16/rev1` 或 `doio/kb16/rev2`，USB 识别为 `D010:1601`。旧版项目中的 KB12-02 / `D010:1202` 已被移除。

## 功能

- 自动发现、连接和重连 KB16，无需手动加载。
- 读取 4 层 `4×5` VIA 矩阵和每层的 3 组旋钮方向映射。
- 配套 QMK 遥测固件可准确显示当前层、多键按下、旋钮按压与双向旋转。
- 将 QMK 代码转换为易读的中文标签，并解析 `KC_TRNS` 的实际下层动作。
- 键盘断开时显示上次缓存；原厂固件未支持遥测时仍可手动预览四层。
- 无边框置顶窗口、透明度、位置/大小恢复、可选开机启动和鼠标穿透。
- 托盘菜单可显示/隐藏、解除穿透、刷新 VIA 键位或退出。

## 开发与运行

需要 Node.js 18+、Rust stable 和 [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)。Windows 开发还需要 Microsoft C++ Build Tools 与 WebView2。

```bash
npm ci
npm run tauri dev
```

检查源码：

```bash
npm run build
npm test
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

构建 Windows 安装产物（源码交付不包含预构建安装包）：

```bash
npm run tauri build
```

## 配套固件

固件 userspace 位于 [`firmware/qmk_userspace`](firmware/qmk_userspace)，同时定义 rev1 和 rev2 构建目标。完整的 Windows/QMK MSYS 步骤、硬件修订区分与恢复方法见 [`firmware/README.md`](firmware/README.md)。

**刷写前必须先从 VIA 导出当前配置。** 新的 VIA 固件首次启动可能重新初始化动态键位 EEPROM，刷写后需要将备份导入。不要把 rev1 固件刷入 rev2，反之亦然。

遥测协议为 VIA `CustomMenuGetValue`、channel `0x00`、value `0x42`，详细字节布局见 [`firmware/TELEMETRY_PROTOCOL.md`](firmware/TELEMETRY_PROTOCOL.md)。

## 项目结构

- `src/` — React 悬浮界面、透明键解析与前端测试。
- `src-tauri/src/` — 串行 HID/VIA 设备服务、缓存、遥测解析、键码文案和 Tauri 命令。
- `src-tauri/resources/kb16-01.json` — 16 键 + 3 旋钮的物理布局。
- `firmware/` — rev1/rev2 共用的 QMK/VIA 遥测固件源码与安全刷写说明。

## 运行时数据

- 键位缓存：系统 cache 目录下的 `via-echo/keymap-v1.json`。
- 悬浮窗设置：系统 config 目录下的 `via-echo/settings.json`。
- 应用不安装全局键盘钩子，不读取其他键盘的系统输入。
