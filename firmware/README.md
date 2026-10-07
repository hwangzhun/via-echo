# KB16 配套固件

这是 viaecho 的 QMK 配套固件源码。同一份 userspace 可分别为 DOIO KB16-01 的 `rev1` 和 `rev2` 两个硬件版本构建。

固件保留 VIA 动态改键、4 层键位、RGB、OLED 层号和动态旋钮映射，同时增加 viaecho 所需的实时状态回传。

## 刷写前必须做的事

1. 打开 VIA，导出并保存当前的键盘配置。新固件首次启动时可能会重新初始化动态键位 EEPROM，从而把现有键位恢复为默认值。
2. 确认键盘 PCB 是 `rev1` 还是 `rev2`，然后只刷入对应版本的固件。
3. 在固件刷写完成、键盘重新连接并通过测试之前，不要删除 VIA 配置备份。

> 不要把 rev1 固件刷入 rev2，也不要把 rev2 固件刷入 rev1。

## 如何识别 rev1 和 rev2

- `rev1`：QMK 使用 `atmega32u4` 处理器和 `atmel-dfu` 引导程序。
- `rev2`：QMK 使用 `STM32F103` 目标和 `stm32duino` 引导程序。
- 可优先检查 PCB 上的版本丝印和主控芯片型号。如果仍不能确定，请先停止刷写。

## 在 Windows 上使用 QMK MSYS 构建

1. 安装并打开 QMK MSYS。
2. 在 QMK MSYS 终端中初始化 QMK 环境：

```sh
qmk setup
```

3. 将 QMK 外部 userspace 路径指向本项目的 `firmware/qmk_userspace`。请把下面的路径替换为实际路径：

```sh
qmk config user.overlay_dir="C:/path/to/via-echo/firmware/qmk_userspace"
qmk userspace-doctor
```

4. 一次构建 rev1 和 rev2：

```sh
qmk userspace-compile
```

也可以只构建指定版本：

```sh
qmk compile -kb doio/kb16/rev1 -km via_echo
qmk compile -kb doio/kb16/rev2 -km via_echo
```

如果使用传统的 QMK 目录结构，也可将：

```text
firmware/qmk_userspace/keyboards/doio/kb16/keymaps/via_echo
```

复制到 QMK 源码树中对应的：

```text
qmk_firmware/keyboards/doio/kb16/keymaps/via_echo
```

然后执行上面两条 `qmk compile` 命令。

## 刷写固件

1. 再次确认 VIA 配置已经导出。
2. 确认所选固件与 PCB 的 rev1/rev2 版本一致。
3. 通过 PCB 复位按钮、现有的 `QK_BOOT` 键位，或 QMK 官方方法进入引导模式。
4. 使用 QMK Toolbox 或对应命令刷入正确的固件。
5. 拔插键盘，等待 Windows 重新识别。
6. 打开 VIA，导入刷写前保存的键位配置。
7. 启动 viaecho，检查连接状态、当前层、按键高亮和三个旋钮的反馈。

## 刷写后的验收项目

- VIA 可以正常识别键盘并导入备份。
- 16 个普通键都能正常输出。
- `MO` / `TG` / `TO` 可正常切换键盘层，viaecho 的 L1–L4 指示同步变化。
- 多键同时按下时，对应键位都会高亮。
- 三个旋钮的左转、右转和按压都有反馈，原本的 VIA 旋钮动作仍然执行。
- USB 拔插、Windows 休眠恢复后，viaecho 可以自动重连。

## 恢复原固件

如果需要恢复，先根据 PCB 版本构建或取得对应的官方 `doio/kb16/rev1` 或 `doio/kb16/rev2` 固件，然后用相同的引导模式刷入。恢复后再通过 VIA 导入之前保存的配置。

电脑端与固件之间的数据格式见 [`TELEMETRY_PROTOCOL.md`](TELEMETRY_PROTOCOL.md)。
