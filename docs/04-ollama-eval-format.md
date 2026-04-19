# 第 4 步：Ollama 评测与压测数据格式

当前平台已经支持：

- 通过 `ollama create -f Modelfile` 注册本地模型
- 通过 `Ollama /api/chat` 运行离线评测
- 通过同一接口采集轻量 benchmark 指标

## 目录约定

每个评测集放在：

`<本仓库根>\runtime\datasets\<evalset_version>\`

建议文件：

- `eval.jsonl`
- `benchmark.jsonl`

如果你想改文件名，可以在实验的 `infer_config` 中指定：

- `eval_file`
- `benchmark_file`

## infer_config 关键字段

示例：

```json
{
  "format": "json",
  "options": {
    "temperature": 0.1,
    "top_p": 0.8,
    "num_ctx": 4096,
    "num_predict": 256,
    "seed": 42
  },
  "ollama_from_model": "qwen2.5:3b",
  "system_prompt": "/no_think\n你是动环监控平台告警诊断助手，只输出 JSON。",
  "skip_eval": false,
  "skip_benchmark": false
}
```

可用字段：

- `ollama_from_model`
  - 从现有 Ollama 模型生成本次 run 使用的本地模型
- `ollama_registered_model`
  - 作用与 `ollama_from_model` 类似，推荐二选一
- `gguf_path`
  - 训练产物若要接入 Ollama，建议提供 GGUF 文件路径
- `ollama_model_name`
  - 自定义本地注册后的模型名
- `system_prompt`
  - 写入 Modelfile 的 SYSTEM 段
- `parameters`
  - 写入 Modelfile 的 PARAMETER 段
- `options`
  - 传给 `/api/chat` 的运行参数
- `format`
  - `json` 或 JSON Schema
- `eval_file`
  - 默认 `eval.jsonl`
- `benchmark_file`
  - 默认 `benchmark.jsonl`
- `skip_ollama`
- `skip_eval`
- `skip_benchmark`

## eval.jsonl 格式

每行一个样本，支持两种输入形式。

### 方式 1：messages

```json
{"id":"case-001","task_type":"normalize_alarm","messages":[{"role":"system","content":"你是动环告警诊断助手，只输出 JSON。"},{"role":"user","content":"站点A，UPS02，告警：蓄电池电压异常，请输出标准化诊断 JSON。"}],"expected_json":{"normalized_alarm_type":"battery_voltage_low","severity":"major"}}
```

### 方式 2：system + user

```json
{"id":"case-002","task_type":"severity_classification","system":"你是动环告警诊断助手，只输出 JSON。","user":"配电室温度过高，已持续 15 分钟，请判断严重度并给出处置建议。","expected_json":{"severity":"critical"}}
```

## 支持的判分字段

- `expected_json`
  - 平台会尝试解析模型输出为 JSON
  - 若输出可解析，会计算字段级准确率
- `require_json`
  - 只检查输出是否是合法 JSON
- `expected_text`
  - 做精确匹配
- `expected_contains`
  - 检查输出是否包含指定关键词列表

## benchmark.jsonl 格式

建议与 `eval.jsonl` 类似，但不需要标注答案。示例：

```json
{"id":"bench-001","messages":[{"role":"user","content":"请对以下多条告警做归因和摘要：......"}]}
```

平台会从 Ollama 响应中提取：

- `total_duration`
- `prompt_eval_count`
- `eval_count`
- `eval_duration`

并汇总为：

- `avg_total_ms`
- `avg_prompt_tokens`
- `avg_gen_tokens`
- `avg_eval_tokens_per_sec`

## 当前限制

### 1. 训练产物接入 Ollama 仍建议走 GGUF

对于 Qwen 系列，平台当前不假定 safetensors 可直接导入 Ollama。  
如果是训练后的模型，请提供：

- `infer_config.gguf_path`

或者把：

- `model.gguf`

放到本次 run 的输出目录。

### 2. 当前评分是轻量版

目前更适合：

- JSON 合法率
- 字段准确率
- 精确匹配
- 关键词命中率

不包含：

- 专家偏好打分
- 复杂根因链一致性评估
- 风险动作规则库

这些会放到后续步骤补充。

### 3. Qwen3 在 Ollama 下默认可能进入 thinking 模式

根据 Qwen3 官方仓库对 Ollama 的说明，Qwen3 默认会先思考；如果你希望离线评测直接拿结构化 JSON，建议在 system 或 user 消息中显式加入：

- `/no_think`

否则可能出现：

- `message.thinking` 很长
- `message.content` 为空
- `json_valid_rate` 被拉成 0
