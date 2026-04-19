# 第 3 步：一期平台脚手架

本步骤的目标是建立最小可运行骨架，而不是一次性把训练平台做满。

当前已完成：

- `backend/` Python 包骨架
- FastAPI 基础服务
- SQLite 元数据模型
- `Experiment / Run / Metric / Artifact` 四张核心表
- 训练后端适配器抽象
- `LLaMA-Factory` 适配器预渲染
- `LLaMA-Factory` 真实 train/export 执行接入
- `ms-swift` 二期占位适配器
- 单进程 SQLite 轮询 Worker

## 当前接口

### 健康检查

- `GET /api/health`

### 实验

- `POST /api/experiments`
- `GET /api/experiments`
- `GET /api/experiments/{id}`

### 运行

- `POST /api/experiments/{id}/runs`
- `GET /api/runs`
- `GET /api/runs/{id}`

## 运行前安装

后端依赖安装脚本：

- [07-install-backend.ps1](<本仓库根>\scripts\windows\07-install-backend.ps1)

## 当前 Worker 行为

Worker 目前会：

1. 轮询 `pending` 的 run
2. 创建运行目录
3. 根据训练后端生成配置
4. 执行 `LLaMA-Factory` 的 train/export
5. 写入 SQLite 产物记录
6. 生成一个 run 级别的 JSON 报告

当前不会：

- 真正注册 Ollama 模型
- 真正执行离线评测和压测

这些会在下一步接入。

## 目录说明

关键路径：

- [backend/app/main.py](<本仓库根>\backend\app\main.py)
- [backend/app/models/entities.py](<本仓库根>\backend\app\models\entities.py)
- [backend/app/adapters/trainer/llamafactory.py](<本仓库根>\backend\app\adapters\trainer\llamafactory.py)
- [backend/app/workers/poller.py](<本仓库根>\backend\app\workers\poller.py)

## 下一步

下一步建议进入：

- 接通 Ollama 模型注册与离线评测
- 接入训练结果解析和 checkpoint 明细记录
