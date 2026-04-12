# LLaMA-Factory 一期落地说明

本文档对应当前项目的一期目标：在 Windows 本机上完成 `训练 -> 导出 -> GGUF -> Ollama 注册 -> 离线评测` 的可执行闭环。

## 1. 一期边界

- 训练框架：`LLaMA-Factory`
- 运行环境：Windows
- 元数据存储：SQLite
- 文件存储：本地文件目录
- 推理验证：`Ollama`
- 评测方式：平台离线评测与 benchmark
- `vLLM`：一期只保留状态位与后续接入预留，不作为 Windows 本机强制落地项

## 2. 目录与环境

- Python 环境：`E:\.env_trains\venvs\lf-py311`
- LLaMA-Factory 源码：`E:\.env_trains\src\LLaMA-Factory`
- llama.cpp 源码：`E:\.env_trains\src\llama.cpp`
- 项目根目录：`E:\ai\ai_trains`

## 3. 基础安装

先执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\01-init-layout.ps1
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\02-create-lf-venv.ps1
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\03-install-llamafactory.ps1
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\07-install-backend.ps1
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\08-install-frontend.ps1
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\13-install-llama-cpp.ps1
```

如果只做一期闭环验证，`13-install-llama-cpp.ps1` 完成到 `convert_hf_to_gguf.py` 可用即可。

## 4. GGUF 策略

当前项目已经修正为：

- Windows 一期默认使用 `gguf_outtype=f16`
- 如果要使用 `q4_k_m`，必须先准备 `llama-quantize.exe`
- 平台会先执行 `HF -> GGUF(f16)`，再在具备量化工具时执行 `GGUF(f16) -> GGUF(q4_k_m)`

这意味着：

- 一期的主链路不会再因为把 `q4_k_m` 直接传给 `convert_hf_to_gguf.py` 而失败
- 想要更小体积 GGUF 时，可以在二次增强时补充 `llama-quantize.exe`

## 5. 平台启动

启动 API：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\05-run-api.ps1
```

启动 Worker：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\06-run-worker.ps1
```

启动前端：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\09-run-frontend.ps1
```

默认访问地址：

- 前端：`http://127.0.0.1:15173`
- 后端：`http://127.0.0.1:18080`

## 6. 前端创建训练任务

前端内的一期默认策略已经调整为：

- `auto_gguf: true`
- `gguf_outtype: "f16"`
- `skip_ollama: false`
- `skip_eval: false`
- `skip_benchmark: false`

也可以直接使用示例请求：

- `E:\ai\ai_trains\examples\requests\llamafactory_sft_alarm_train.json`

## 7. 用已有 merged 模型做闭环冒烟

如果你已经有一个导出的 `merged` 模型目录，直接执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\14-smoke-lf-phase1.ps1 -RunId run_xxx
```

或直接指定目录：

```powershell
powershell -ExecutionPolicy Bypass -File E:\ai\ai_trains\scripts\windows\14-smoke-lf-phase1.ps1 -MergedDir E:\ai\ai_trains\runtime\runs\run_xxx\output\merged
```

该脚本会自动完成：

1. `merged safetensors -> model.gguf`
2. 生成 `Modelfile`
3. `ollama create`
4. 运行 `smoke_eval`
5. 运行 `benchmark`

输出位置：

- 转换日志：`runtime\runs\<run_id>\logs\gguf-convert.log`
- Ollama 日志：`runtime\runs\<run_id>\logs\ollama-create.log`
- 评测结果：`runtime\runs\<run_id>\eval`
- 基准结果：`runtime\runs\<run_id>\benchmark`

## 8. 一期建议命令

训练与导出由 Worker 触发后，核心命令等价于：

```powershell
E:\.env_trains\venvs\lf-py311\Scripts\llamafactory-cli.exe train E:\ai\ai_trains\runtime\runs\<run_id>\input\llamafactory.train.yaml
E:\.env_trains\venvs\lf-py311\Scripts\llamafactory-cli.exe export E:\ai\ai_trains\runtime\runs\<run_id>\input\llamafactory.export.yaml
E:\.env_trains\venvs\lf-py311\Scripts\python.exe E:\.env_trains\src\llama.cpp\convert_hf_to_gguf.py E:\ai\ai_trains\runtime\runs\<run_id>\output\merged --outfile E:\ai\ai_trains\runtime\runs\<run_id>\output\model.gguf --outtype f16
ollama create <model_name> -f E:\ai\ai_trains\runtime\runs\<run_id>\output\Modelfile
```

如果后续补齐量化工具，再追加：

```powershell
E:\.env_trains\src\llama.cpp\build\bin\Release\llama-quantize.exe E:\ai\ai_trains\runtime\runs\<run_id>\output\model.f16.gguf E:\ai\ai_trains\runtime\runs\<run_id>\output\model.gguf Q4_K_M
```

## 9. 当前落地状态

一期已经具备：

- Windows 本机训练与导出
- GGUF 自动生成
- Ollama 自动注册
- 离线评测
- benchmark
- 自动日志落盘

当前仍保留为后续扩展项：

- `q4_k_m` 自动量化依赖 `llama-quantize.exe`
- `vLLM` 实际部署建议放到二期 WSL/Linux
