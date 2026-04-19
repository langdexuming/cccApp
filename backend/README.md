# Backend Scaffold

## Scope

This backend is the phase-1 scaffold for:

- FastAPI control plane
- SQLite metadata store
- Local file artifacts
- Single-process polling worker
- Trainer adapter abstraction

Phase 1 now executes LLaMA-Factory train and export from the worker.  
When `llama.cpp` is available under `E:\.env_trains\src\llama.cpp`, the worker can
continue with:

- GGUF conversion
- Optional GGUF quantization when `llama-quantize.exe` is available
- Ollama model registration
- Offline evaluation
- Benchmark generation

## Install

Use the Python environment prepared under:

- `E:\.env_trains\venvs\lf-py311`

在**本仓库根目录**下的 `backend` 文件夹中执行（路径随你克隆位置而定）：

```powershell
E:\.env_trains\venvs\lf-py311\Scripts\python.exe -m pip install -e .
```

## Run API

```powershell
E:\.env_trains\venvs\lf-py311\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18080 --reload
```

## Run Worker

```powershell
E:\.env_trains\venvs\lf-py311\Scripts\python.exe -m app.workers.poller --interval 5
```

## Minimal flow

1. Create an experiment through `POST /api/experiments`
2. Queue a run through `POST /api/experiments/{id}/runs`
3. Start the worker
4. Inspect `GET /api/runs/{id}`
5. Check logs and artifacts under 本仓库下的 `runtime/` 目录

## GGUF Tooling

To enable the full phase-1 `export -> GGUF -> Ollama -> eval` chain on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\13-install-llama-cpp.ps1
```

The worker then looks for:

- `E:\.env_trains\src\llama.cpp\convert_hf_to_gguf.py`
- `E:\.env_trains\src\llama.cpp\build\bin\Release\llama-quantize.exe` for `q4_k_m` and similar quantized outputs
- `E:\.env_trains\venvs\lf-py311\Scripts\python.exe`

The default Windows-safe setting is `gguf_outtype=f16`.  
If you want `q4_k_m`, first build `llama-quantize.exe`, then set `infer_config.gguf_outtype=q4_k_m`.
