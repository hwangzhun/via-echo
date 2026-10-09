应用图标来自仓库中的 [`logo/viaecho.svg`](../../logo/viaecho.svg)，Illustrator 原稿保存在 [`logo/viaecho.ai`](../../logo/viaecho.ai)。

修改 SVG 后运行 `npm run icons`，或直接运行构建命令。`scripts/ensure-icon.js` 会检查源文件 SHA-256，更新 `icon.png`、`icon.ico` 和 `source.sha256`。应用窗口、托盘及“设备与关于”页面共用这些图标。

logo 原稿、SVG 和本目录的图标文件均应提交到 Git，保证克隆仓库后有完整的应用资源。
