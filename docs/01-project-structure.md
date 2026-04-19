# 一期/二期项目结构与配置约束

## 目标

本项目分两期建设：

- 一期：`LLaMA-Factory` 训练后端
- 二期：`ms-swift` 训练后端

平台层保持一致：

- 操作系统：Windows 主控
- 数据库：SQLite
- 存储：本地文件
- 推理对比：Ollama
- 前端：H5 App

目录和配置从一开始就按“双训练后端”设计，但一期只启用 `LLaMA-Factory`。

## 路径约束

### 固定根目录

- 项目代码目录：`E:\ai\ai_trains`
- Windows 环境根目录：`E:\.env_trains`
- 二期 WSL 根目录：`E:\wsl`

### 不允许写死到 C 盘的内容

- Python 虚拟环境
- pip 缓存
- Hugging Face 缓存
- Torch 缓存
- npm 缓存
- 临时文件目录
- SQLite 数据文件
- 训练产物
- 日志和报告

## 推荐目录结构

```text
E:\ai\ai_trains
  backend\
    app\
      api\
      core\
      db\
      models\
      schemas\
      services\
      adapters\
        trainer\
        inference\
        exporter\
      workers\
      reports\
    tests\
  frontend\
    src\
    public\
  scripts\
    windows\
    wsl\
  config\
    app.example.yaml
    paths.example.yaml
    trainer.example.yaml
  docs\
  runtime\
    sqlite\
    datasets\
    templates\
    experiments\
    runs\
    artifacts\
      adapters\
      merged\
      gguf\
      ollama\
    logs\
      api\
      worker\
      train\
      eval\
      benchmark\
    reports\
      single\
      compare\
```

## 外部环境目录

```text
E:\.env_trains
  venvs\
    lf-py311\
    tooling-py311\
  cache\
    pip\
    huggingface\
      hub\
    torch\
    npm\
    modelscope\
    ollama\
  tmp\
```

二期 WSL 目录：

```text
E:\wsl
  Ubuntu-22.04\
```

## 一期/二期职责划分

### 一期：LLaMA-Factory

支持：

- `Qwen3.5-2B` 原始推理基线
- `Qwen3.5-2B + LoRA-SFT`
- `Qwen3.5-2B-Base + LoRA-SFT`
- 模型导出
- Ollama 推理评测
- 对比报告

### 二期：ms-swift

新增：

- `Qwen3.5-2B-Base + DAPT/CPT + SFT`
- 更复杂训练配置
- 更长链路任务编排

不变：

- H5 前端
- FastAPI
- SQLite
- 本地文件存储
- Ollama 评测链路
- 报告结构

## 平台分层

### 1. 平台公共层

路径：

- `backend/app/api`
- `backend/app/core`
- `backend/app/db`
- `backend/app/models`
- `backend/app/schemas`
- `backend/app/services`
- `backend/app/reports`

职责：

- 实验管理
- 配置管理
- 任务状态管理
- 指标落库
- 报告生成

### 2. 训练后端适配层

路径：

- `backend/app/adapters/trainer/base.py`
- `backend/app/adapters/trainer/llamafactory.py`
- `backend/app/adapters/trainer/swift.py`

职责：

- 渲染训练配置
- 生成训练命令
- 触发训练
- 处理导出
- 返回标准化产物

### 3. 推理适配层

路径：

- `backend/app/adapters/inference/ollama.py`

职责：

- 注册本地模型
- 统一调用 Ollama API
- 离线评测
- 性能压测

### 4. Worker 层

路径：

- `backend/app/workers`

职责：

- 轮询 SQLite 中的待执行任务
- 串行执行训练流程
- 写回状态与日志

## 训练后端抽象

平台层不要直接依赖具体训练框架命令，统一抽象出以下接口：

- `prepare()`
- `train()`
- `export()`
- `build_artifacts()`

标准输入包括：

- `trainer_backend`
- `route_type`
- `base_model`
- `dataset_version`
- `prompt_template_version`
- `train_config`

标准输出包括：

- adapter 路径
- merged model 路径
- GGUF 路径
- Ollama 模型名
- 训练日志路径

## 配置文件设计

### 1. app.yaml

职责：

- 服务级配置
- SQLite 路径
- 运行模式
- 日志级别

### 2. paths.yaml

职责：

- 所有本地目录根路径
- 统一约束不写死到用户目录或 C 盘
- 训练 CLI 可执行文件路径

### 3. trainer.yaml

职责：

- 训练后端默认参数
- 训练 profile
- 推理 profile

## 推荐配置加载优先级

1. 系统环境变量
2. `.env`
3. `config/*.yaml`
4. 代码默认值

## 命名约定

### 实验 ID

格式建议：

`exp_YYYYMMDD_NNN`

示例：

`exp_20260412_001`

### 运行 ID

格式建议：

`run_YYYYMMDD_NNN`

### 本地 Ollama 模型名

格式建议：

`alarm-{backend}-{base}-{run_id}`

示例：

`alarm-llamafactory-qwen35-2b-run_20260412_001`

## 运行时文件布局

### 每次运行目录

```text
runtime\runs\run_20260412_001\
  input\
  output\
  logs\
  eval\
  benchmark\
```

### 建议保存的产物

- 原始实验快照 JSON
- 渲染后的训练配置
- 训练日志
- adapter 路径记录
- merged model 路径记录
- GGUF 路径记录
- Ollama Modelfile
- 评测结果 JSON
- 压测结果 JSON
- HTML 报告

## 一期最低可运行闭环

1. 创建实验
2. 生成运行目录
3. 执行 `LLaMA-Factory` 训练
4. 导出模型
5. 转换并注册到 Ollama
6. 运行统一评测
7. 生成对比报告

## 二期扩展原则

新增 `ms-swift` 时：

- 不改 SQLite 主表结构
- 不改单实验和对比报告结构
- 不改前端主要页面
- 仅新增训练后端适配器和新 route

## 当前建议

第 1 步先冻结目录和配置约束。  
第 2 步再做 Windows 一期安装清单。  
第 3 步再开始落脚手架。
