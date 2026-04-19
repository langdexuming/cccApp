# 第 6 步：最小联调清单

这一步的目标不是先跑真实训练，而是先验证下面这条链路：

`H5 前端 / PowerShell -> FastAPI -> SQLite -> Worker -> Ollama -> 评测结果落盘`

## 最小里程碑

先跑通：

- `baseline_infer`
- 现有本地 Ollama 模型
- 示例评测集

只有这条链路稳定了，再去跑真实 `LLaMA-Factory` 训练。

## 前置条件

你至少需要：

1. 已完成 [02-windows-llamafactory-setup.md](E:\ai\ai_trains\docs\02-windows-llamafactory-setup.md) 中的目录和环境初始化
2. 已安装后端依赖
3. 已安装前端依赖
4. 本机 `Ollama` 已启动
5. 本机已经有一个可用的 Ollama 模型

这里的第 5 点很关键。  
当前 smoke test 不强制要求一定是 Qwen3.5，只要求你本地已经有一个能被 `ollama create FROM <model>` 复用的模型。

如果你使用的是 `qwen3:*` 系列，建议保留模板里的：

- `/no_think`

这是为了避免 Qwen3 默认进入 thinking 模式后，结构化 JSON 评测拿不到最终 `content`。

## 一次性初始化

### 1. 复制示例数据

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\10-seed-sample-data.ps1
```

复制后会得到：

- `E:\ai\ai_trains\runtime\datasets\alarm_eval_v1`
- `E:\ai\ai_trains\runtime\datasets\alarm_sft_v1`

### 2. 安装后端依赖

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\07-install-backend.ps1
```

### 3. 安装前端依赖

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\08-install-frontend.ps1
```

## 启动顺序

### 1. 启动 API

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\05-run-api.ps1
```

### 2. 启动 Worker

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\06-run-worker.ps1
```

### 3. 启动前端

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\09-run-frontend.ps1
```

前端默认地址：

- `http://127.0.0.1:15173`

后端默认地址：

- `http://127.0.0.1:18080`

## 路线 A：最快的 smoke test

使用一个你本地已经存在的 Ollama 模型名，例如：

- `你的本地模型名`

然后执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\11-post-baseline-experiment.ps1 -OllamaModel "你的本地模型名"
```

这个脚本会：

1. 读取 [baseline_infer_alarm_eval.json](E:\ai\ai_trains\examples\requests\baseline_infer_alarm_eval.json)
2. 将 `YOUR_OLLAMA_MODEL` 替换为你传入的模型名
3. 调用 `POST /api/experiments`
4. 调用 `POST /api/experiments/{id}/runs`

随后 Worker 会自动开始执行：

1. 生成本次 run 目录
2. 生成 `Modelfile`
3. 调用 `ollama create`
4. 运行评测
5. 运行 benchmark
6. 生成报告

## 结果检查

### API 中看状态

可以直接打开：

- `GET http://127.0.0.1:18080/api/runs`
- `GET http://127.0.0.1:18080/api/runs/<run_id>`

### 前端里看状态

打开：

- `http://127.0.0.1:15173/runs`

### 文件落盘位置

重点看：

- `E:\ai\ai_trains\runtime\runs\<run_id>\logs`
- `E:\ai\ai_trains\runtime\runs\<run_id>\eval`
- `E:\ai\ai_trains\runtime\runs\<run_id>\benchmark`
- `E:\ai\ai_trains\runtime\reports\single\<run_id>.json`

## 路线 B：最小训练样本准备

示例训练数据已经给出：

- [dataset_info.json](E:\ai\ai_trains\examples\datasets\alarm_sft_v1\dataset_info.json)
- [alarm_sft_v1.json](E:\ai\ai_trains\examples\datasets\alarm_sft_v1\alarm_sft_v1.json)

这个样本是一个极小的 `alpaca` 风格示例，只适合：

- 验证训练管线是否能启动
- 验证目录和数据定位是否正确

不适合：

- 得到有意义的业务效果
- 做模型优劣比较

训练实验模板：

- [llamafactory_sft_alarm_train.json](E:\ai\ai_trains\examples\requests\llamafactory_sft_alarm_train.json)

## 当前最现实的限制

### 1. 训练后模型接入 Ollama 仍然需要 GGUF

如果是训练后的 run，要继续接到 Ollama：

- 在 `infer_config` 中传 `gguf_path`

或者：

- 把 `model.gguf` 放到 run 输出目录

当前平台不会假定 Qwen 的 safetensors 可直接导入 Ollama。

### 2. 当前报告还是轻量版

现在的报告更偏工程联调，不是最终业务评测报告。  
当前重点是验证：

- run 是否可创建
- Worker 是否能执行
- Ollama 是否可注册
- 评测和 benchmark 是否能落库

## 建议的下一步顺序

1. 先跑通 baseline smoke test
2. 再跑最小 SFT 训练
3. 再补 GGUF 转换链路
4. 最后再做真正的业务对比实验
