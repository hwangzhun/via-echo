# VIA 键盘 Hub

桌面应用：实时显示 VIA 键盘（KB12-02）键位与功能，按键时高亮对应键位。

- **技术栈**：Tauri 2 + Rust + React (TypeScript)
- **键位数据**：通过 [qmk-via-api](https://crates.io/crates/qmk-via-api) 从键盘读取；布局来自 `src-tauri/resources/kb12-02.json`。

## 环境要求

- Node.js 18+
- Rust (stable)
- 系统已安装 [Tauri 依赖](https://v2.tauri.app/start/prerequisites/)

## 运行

```bash
cd via-hub
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

## 使用说明

1. 启动后会自动加载布局；若之前连过键盘，会尝试从缓存恢复键位。
2. 点击「从键盘加载键位」：连接 KB12-02 后读取当前 4 层 keymap 并显示。
3. 切换「层」下拉框查看不同层的键位。
4. 从键盘按下某键时，界面上对应键会高亮（需已从键盘加载过键位）。

未连接键盘时可用「从缓存加载」显示上次保存的键位（高亮仍依赖缓存中的 keymap）。

## 项目结构

- `src/` — React 前端（布局、层切换、高亮）
- `src-tauri/src/` — Rust：`config.rs` 解析 JSON 布局，`keymap.rs` 使用 qmk-via-api 读 keymap，`key_listener.rs` 用 rdev 监听全局按键并发送高亮事件
