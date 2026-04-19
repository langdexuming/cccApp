# 第 7 步：ms-swift 9B-Base 预适配

当前阶段的目标不是部署 `ms-swift`，而是先把平台层的训练配置、评测引用和运行产物接口接通。

本阶段已经完成：

- `Qwen/Qwen3.5-9B-Base` 的 `ms-swift` 训练预设
- `ms-swift` 预览模式训练适配器
- 面向未来实际训练的 train/export 配置文件落盘
- 面向未来 Ollama 评测的 eval/benchmark 计划文件落盘

本阶段不会执行：

- 不安装 `ms-swift`
- 不下载 `Qwen/Qwen3.5-9B-Base`
- 不启动真实训练
- 不导出模型
- 不注册 Ollama

## 数据集版本

- `alarm_analysis_swift_sft_v1`
  - 位置：`<本仓库根>\runtime\datasets\alarm_analysis_swift_sft_v1`
  - 格式：JSONL
  - 结构：`messages` 聊天样式，适配 `ms-swift` 自定义数据集

- `alarm_analysis_eval_v1`
  - 位置：`<本仓库根>\runtime\datasets\alarm_analysis_eval_v1`
  - 用途：后续 Ollama 评测与 benchmark

## 示例请求

- [swift_sft_alarm_analysis_qwen35_9b_base_preview.json](<本仓库根>\examples\requests\swift_sft_alarm_analysis_qwen35_9b_base_preview.json)

这份请求会创建一个：

- 基础模型为 `Qwen/Qwen3.5-9B-Base`
- 训练方案为 `swift`
- 训练模式为 `sft`
- 运行策略为“只生成配置和评测计划，不执行真实训练”

## 运行后可看到的产物

当你创建并启动一次 `swift` 训练后，Worker 会在对应 run 目录下生成：

- `input/swift.train.yaml`
- `input/swift.export.yaml`
- `input/swift.eval.yaml`
- `input/swift.preview.txt`
- `output/command_preview.json`
- `reports/single/<run_id>.json`

这些文件用于：

- 确认训练参数是否符合预期
- 确认评测集引用是否正确
- 为后续 WSL + `ms-swift` 真训练阶段做交接

## 未来切换到真训练时

后续如果进入二期真实训练，再补：

1. WSL 环境与 `ms-swift` 安装
2. `swift` CLI 的真实执行入口
3. 导出模型和 Ollama 注册链路
4. 真正的离线评测与对比报告
