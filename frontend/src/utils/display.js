export function formatStatusText(status) {
  const value = String(status || '').toLowerCase()

  const labels = {
    draft: '草稿',
    queued: '排队中',
    pending: '待处理',
    running: '运行中',
    active: '运行中',
    online: '正常',
    completed: '已完成',
    success: '成功',
    done: '完成',
    failed: '失败',
    error: '错误',
    critical: '严重',
    unknown: '未知',
  }

  return labels[value] || String(status || '-')
}

export function formatStepText(step) {
  const value = String(step || '').toLowerCase()

  const labels = {
    queued: '已排队',
    pending: '待处理',
    prepare: '准备数据',
    train: '模型训练',
    export: '导出模型',
    gguf_convert: '转换 GGUF',
    ollama_register: '注册 Ollama',
    eval: '评测验证',
    benchmark: '基准对比',
    report: '生成报告',
    running: '执行中',
    completed: '已完成',
    failed: '已失败',
  }

  return labels[value] || String(step || '-')
}

export function formatRouteType(routeType) {
  const value = String(routeType || '').toLowerCase()
  const labels = {
    sft: '监督微调',
    baseline_infer: '基线推理',
  }

  return labels[value] || String(routeType || '-')
}

export function formatTrainerBackend(trainerBackend) {
  const value = String(trainerBackend || '').toLowerCase()
  const labels = {
    llamafactory: 'LLaMA-Factory 方案',
    swift: 'ms-swift 方案',
  }

  return labels[value] || String(trainerBackend || '-')
}

export function formatEnvLabel(env) {
  const value = String(env || '').toLowerCase()
  const labels = {
    local: '本地',
    dev: '开发',
    development: '开发',
    prod: '生产',
    production: '生产',
    staging: '预发',
    test: '测试',
    testing: '测试',
    unknown: '未知',
  }

  return labels[value] || String(env || '-')
}
