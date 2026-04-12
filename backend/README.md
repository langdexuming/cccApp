# Backend Scaffold

## Scope

This backend is the phase-1 scaffold for:

- FastAPI control plane
- SQLite metadata store
- Local file artifacts
- Single-process polling worker
- Trainer adapter abstraction

Phase 1 now executes LLaMA-Factory train and export from the worker.  
Ollama evaluation wiring still comes next.

## Install

Use the Python environment prepared under:

- `E:\.env_trains\venvs\lf-py311`

From [E:\ai\ai_trains\backend](E:\ai\ai_trains\backend):

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
5. Check logs and artifacts under [runtime](E:\ai\ai_trains\runtime)
