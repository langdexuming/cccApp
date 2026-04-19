<template>
  <div class="page-run-detail">
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="10" animated />
    </div>

    <template v-else-if="run">
      <div class="page-header">
        <div class="header-main">
          <el-button link class="back-button" @click="router.back()">
            <ArrowLeft :size="16" />
            <span>返回</span>
          </el-button>
          <div class="title-row">
            <h1 class="page-title">运行 {{ run.id }}</h1>
            <StatusBadge :status="run.status" />
          </div>
          <p class="page-desc">
            所属训练：{{ experiment?.name || run.experiment_id }}，创建于 {{ formatDateTime(run.created_at) }}
          </p>
        </div>
        <div class="header-actions">
          <el-button @click="loadRunDetail">刷新</el-button>
          <el-button
            v-if="compareTargetId"
            type="primary"
            plain
            @click="$router.push({ path: '/runs/compare', query: { left: run.id, right: compareTargetId } })"
          >
            对比
          </el-button>
        </div>
      </div>

      <div class="summary-grid">
        <PanelCard v-for="item in summaryItems" :key="item.label">
          <div class="summary-item">
            <div class="summary-label">{{ item.label }}</div>
            <div class="summary-value" :class="{ 'mono-text': item.mono }">{{ item.value }}</div>
          </div>
        </PanelCard>
      </div>

      <div v-if="run.error_message" class="error-panel">
        <div class="error-header">
          <AlertTriangle :size="18" />
          <span>运行错误</span>
        </div>
        <pre class="error-body"><code>{{ run.error_message }}</code></pre>
      </div>

      <div class="detail-grid">
        <div class="left-column">
          <PanelCard title="指标分组" subtitle="指标按照后端返回的命名空间进行分组。">
            <div v-if="metricGroups.length" class="metric-group-stack">
              <section v-for="group in metricGroups" :key="group.name" class="metric-group">
                <div class="metric-group-name">{{ group.name }}</div>
                <div class="metric-grid">
                  <div v-for="metric in group.items" :key="metric.id" class="metric-card">
                    <span class="metric-name">{{ metric.metric_name }}</span>
                    <strong class="metric-value mono-text">{{ formatMetricValue(metric.metric_value) }}</strong>
                    <span class="metric-time">{{ formatDateTime(metric.created_at) }}</span>
                  </div>
                </div>
              </section>
            </div>
            <div v-else class="empty-block">当前运行还没有记录指标。</div>
          </PanelCard>

          <PanelCard title="运行产物" subtitle="展示当前运行生成的文件与检查点。" class="artifacts-panel">
            <div v-if="run.artifacts.length" class="artifact-list">
              <div v-for="artifact in run.artifacts" :key="artifact.id" class="artifact-row">
                <div class="artifact-copy">
                  <div class="artifact-type">{{ artifact.artifact_type }}</div>
                  <div class="artifact-path mono-text">{{ artifact.file_path }}</div>
                  <div class="artifact-time">{{ formatDateTime(artifact.created_at) }}</div>
                </div>
                <el-button link type="primary" @click="copyText(artifact.file_path)">复制路径</el-button>
              </div>
            </div>
            <div v-else class="empty-block">暂无运行产物。</div>
          </PanelCard>
        </div>

        <div class="right-column">
          <PanelCard title="运行路径" subtitle="展示后端返回的输出目录和日志路径。">
            <div class="path-stack">
              <div class="path-item">
                <span class="path-label">输出目录</span>
                <button class="path-box" type="button" @click="copyText(run.output_dir)">
                  <span class="mono-text">{{ run.output_dir || '暂无' }}</span>
                  <Copy :size="14" />
                </button>
              </div>
              <div class="path-item">
                <span class="path-label">日志路径</span>
                <button class="path-box" type="button" @click="copyText(run.log_path)">
                  <span class="mono-text">{{ run.log_path || '暂无' }}</span>
                  <Copy :size="14" />
                </button>
              </div>
            </div>
          </PanelCard>

          <PanelCard title="训练快照" subtitle="展示该运行关联的训练配置。" class="snapshot-panel">
            <JsonBlock :data="experimentSnapshot" label="训练配置" />
          </PanelCard>

          <PanelCard title="运行快照" subtitle="展示后端返回的原始运行数据。">
            <JsonBlock :data="runSnapshot" label="运行数据" />
          </PanelCard>
        </div>
      </div>
    </template>

    <div v-else class="empty-state">
      <div class="empty-title">未找到运行记录</div>
      <div class="empty-desc">{{ loadError || '后端未返回该 ID 对应的运行记录。' }}</div>
      <el-button type="primary" @click="$router.push('/runs')">返回运行列表</el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, AlertTriangle, Copy } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'

import { fetchExperiment, fetchRun, fetchRuns } from '@/api/client'
import PanelCard from '@/components/ui/PanelCard.vue'
import JsonBlock from '@/components/ui/JsonBlock.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { formatStepText } from '@/utils/display'
import { formatDateTime, formatDuration, formatMetricValue } from '@/utils/format'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const run = ref(null)
const experiment = ref(null)
const allRuns = ref([])

const summaryItems = computed(() => {
  if (!run.value) {
    return []
  }

    return [
    {
      label: '训练 ID',
      value: run.value.experiment_id,
      mono: true,
    },
    {
      label: '当前步骤',
      value: formatStepText(run.value.current_step),
      mono: false,
    },
    {
      label: '运行耗时',
      value: formatDuration(run.value.started_at, run.value.finished_at, run.value.status),
      mono: true,
    },
    {
      label: '指标数量',
      value: String(run.value.metrics.length),
      mono: true,
    },
    {
      label: '产物数量',
      value: String(run.value.artifacts.length),
      mono: true,
    },
    {
      label: '运行次数',
      value: String(run.value.run_no),
      mono: true,
    },
  ]
})

const metricGroups = computed(() => {
  if (!run.value) {
    return []
  }

  const grouped = new Map()
  for (const item of run.value.metrics) {
    const groupName = item.metric_group || '默认分组'
    if (!grouped.has(groupName)) {
      grouped.set(groupName, [])
    }
    grouped.get(groupName).push(item)
  }

  return Array.from(grouped.entries()).map(([name, items]) => ({
    name,
    items: [...items].sort((left, right) => left.metric_name.localeCompare(right.metric_name)),
  }))
})

const experimentSnapshot = computed(() => {
  if (!experiment.value) {
    return { message: '训练快照不可用。' }
  }
  return experiment.value
})

const runSnapshot = computed(() => {
  if (!run.value) {
    return {}
  }
  return run.value
})

const compareTargetId = computed(() => {
  if (!run.value) {
    return ''
  }

  const sameExperimentCandidate = allRuns.value.find(
    (item) => item.id !== run.value.id && item.experiment_id === run.value.experiment_id,
  )
  if (sameExperimentCandidate) {
    return sameExperimentCandidate.id
  }

  const completedCandidate = allRuns.value.find((item) => item.id !== run.value.id && item.status === 'completed')
  return completedCandidate?.id || ''
})

async function copyText(value) {
  if (!value) {
    ElMessage.warning('没有可复制的内容。')
    return
  }

  try {
    await navigator.clipboard.writeText(String(value))
    ElMessage.success('已复制到剪贴板。')
  } catch (error) {
    ElMessage.error('复制到剪贴板失败。')
  }
}

async function loadRunDetail() {
  loading.value = true
  loadError.value = ''

  try {
    const runId = String(route.params.id || '')
    const runData = await fetchRun(runId)

    run.value = runData

    const [experimentData, runList] = await Promise.all([
      fetchExperiment(runData.experiment_id).catch(() => null),
      fetchRuns().catch(() => []),
    ])

    experiment.value = experimentData
    allRuns.value = runList
  } catch (error) {
    run.value = null
    experiment.value = null
    allRuns.value = []
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    loadRunDetail()
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.page-run-detail {
  padding: 32px;
  max-width: 1600px;
  margin: 0 auto;
}

.loading-state {
  padding: 12px 0;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.header-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.back-button {
  width: fit-content;
  padding: 0;
  color: var(--text-secondary);
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.page-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.error-panel {
  margin-bottom: 24px;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid #fecaca;
  background: #fff7f7;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 700;
}

.error-body {
  margin: 0;
  padding: 18px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #7f1d1d;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
  gap: 24px;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.metric-group-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.metric-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metric-group-name {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 14px;
}

.metric-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--divider-color);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-name {
  color: var(--text-secondary);
  font-size: 13px;
}

.metric-value {
  font-size: 22px;
  color: var(--text-primary);
}

.metric-time {
  color: var(--text-muted);
  font-size: 11px;
}

.artifact-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.artifact-row {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--divider-color);
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.artifact-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.artifact-type {
  font-size: 12px;
  color: #1d4ed8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.artifact-path {
  color: var(--text-primary);
  word-break: break-word;
}

.artifact-time {
  color: var(--text-muted);
  font-size: 11px;
}

.path-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.path-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.path-box {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--divider-color);
  border-radius: 14px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;

  &:hover {
    border-color: #cbd5e1;
    background: #ffffff;
  }

  span {
    word-break: break-word;
  }
}

.snapshot-panel :deep(.json-code) {
  max-height: 300px;
}

.empty-block {
  padding: 22px 0;
  color: var(--text-muted);
  text-align: center;
  font-size: 14px;
}

.empty-state {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
}

.empty-title {
  font-size: 22px;
  font-weight: 700;
}

.empty-desc {
  max-width: 520px;
  color: var(--text-muted);
}

@media (max-width: 1280px) {
  .detail-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .page-run-detail {
    padding: 20px;
  }

  .page-header,
  .title-row,
  .artifact-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
