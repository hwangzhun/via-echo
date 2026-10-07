# viaecho

viaecho 是为 **DOIO KB16-01** 设计的 Windows 悬浮键位提示器。它会自动读取 VIA 中的四层键位，跟随键盘当前层，并实时反馈 16 个普通键和 3 个旋钮的按压/旋转操作。

> 正确的 QMK 目标是 `doio/kb16/rev1` 或 `doio/kb16/rev2`，USB 识别为 `D010:1601`。旧版项目中的 KB12-02 / `D010:1202` 已被移除。

## 功能

- 自动发现、连接和重连 KB16，无需手动加载。
- 读取 4 层 `4×5` VIA 矩阵和每层的 3 组旋钮方向映射。
- 配套 QMK 遥测固件可准确显示当前层、多键按下、旋钮按压与双向旋转。
- 将 QMK 代码转换为易读的中文标签，并解析 `KC_TRNS` 的实际下层动作。
- 键盘断开时显示上次缓存；原厂固件未支持遥测时仍可手动预览四层。
- 无边框置顶窗口、透明度、位置/大小恢复、可选开机启动和鼠标穿透。
- 独立配置窗：四层自由预览、按层自定义显示名称、外观与设备状态管理。
- 托盘菜单可显示/隐藏悬浮窗、解除穿透、打开配置、刷新 VIA 键位或退出。

## 使用流程

启动后仅显示悬浮提示窗。支持遥测的键盘会自动同步当前层、按键与旋钮状态；无遥测时可手动预览 L1–L4，断开后保留最后显示层与缓存。点击齿轮或托盘“打开配置”进入独立配置窗。

在“键位名称”选择层，再点击键帽、旋钮按压或旋转方向，使用右侧编辑栏保存名称。预览层与设备当前层相互独立，设备切层不会打断编辑。名称仅改变显示文案，实际功能仍由 VIA 配置；恢复原名不会影响其他层或动作。切换编辑对象、页面或关闭配置窗前，可保存、放弃或取消未保存的修改。

“悬浮窗”设置仅将透明度、置顶、变淡和穿透应用于悬浮提示窗。操作 KB16 会唤醒提示，持续按住按键时保持清晰。配置窗始终不透明且可操作，穿透仍可从托盘解除。

关闭配置窗仅隐藏该窗口；关闭悬浮窗或选择托盘“退出”会结束应用。两个窗口分别恢复位置和尺寸。启动时配置窗保持隐藏，鼠标穿透恢复为关闭。

修改 VIA 映射后，在“设备与关于”刷新键位；只有设备读取完成后才报告成功，失败会显示原因。

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

- `src/` — React 双窗口界面、共享键盘组件、状态订阅、透明键解析与交互测试。
- `src-tauri/src/` — 串行 HID/VIA 设备服务、缓存、遥测解析、键码文案和 Tauri 命令。
- `src-tauri/resources/kb16-01.json` — 16 键 + 3 旋钮的物理布局。
- `firmware/` — rev1/rev2 共用的 QMK/VIA 遥测固件源码与安全刷写说明。

## 运行时数据

- 键位缓存：系统 cache 目录下的 `via-echo/keymap-v1.json`。
- 悬浮窗设置：系统 config 目录下的 `via-echo/settings.json`。
- 应用不安装全局键盘钩子，不读取其他键盘的系统输入。

## 双窗口接口与验证

- `open_settings` 打开或聚焦单例配置窗；窗口标签分别为 `main` 和 `settings`。
- `update_settings({ patch })` 按字段合并设置，`customLabels` 按标识逐项合并，值为 `null` 时移除该项。后端串行处理并广播 `settings-changed`，保存失败会返回错误。
- `refresh_keymap` 请求读取，`get_refresh_state` 和 `refresh-state` 提供 `idle / running / success / error` 状态；命令返回不代表读取成功。
- 前端测试覆盖编辑草稿保护、设备切层、保存失败重试、跨窗口同步、刷新状态与变淡计时；Rust 测试覆盖补丁合并、旧设置兼容及已有协议行为。

Windows 实机验收步骤：

1. 连接配套遥测固件，配置窗预览其他层并编辑名称；切换硬件层，确认草稿保留、悬浮窗跟随，非当前预览层不显示输入高亮。
2. 启用变淡，等待变淡后按键／旋转，确认立即恢复；长按超过等待时间不变淡，释放后重新计时。
3. 启用鼠标穿透，确认配置窗仍可操作；用托盘解除并恢复悬浮窗。
4. 关闭配置窗后通过托盘重新打开；关闭悬浮窗后确认应用与托盘一并退出。
5. 改变两窗位置和尺寸并重启，确认分别恢复，配置窗仍隐藏且穿透关闭。
6. 在 100%、150%、200% 缩放，以及配置窗最小尺寸 800×560 下检查文字、旋钮标签、滚动与键盘导航。
7. 使用无遥测固件和拔插设备，确认手动预览、缓存标识、刷新失败反馈与自动重连。

界面字体、图标和标题栏规范见 [`docs/ui-typography.md`](docs/ui-typography.md)。

### 品牌资源

应用名称统一为 `viaecho`。原始 logo 位于 `logo/viaecho.svg`，执行 `npm run icons` 会生成应用与托盘图标；构建时也会检查并更新。关于页面复用同一 logo。为兼容旧版本，设置与缓存仍保存在原有 `via-echo` 目录，应用标识保持不变。

配置页键盘按可用宽高等比例缩放；连接指示灯固定为绿色（已连接，包括无遥测）、灰色（未连接/连接中）和红色（错误），不受强调色影响。
