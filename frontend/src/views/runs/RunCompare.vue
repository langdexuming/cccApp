<template>
  <div class="page-run-compare">
    <div class="compare-hero">
      <div class="hero-copy">
        <div class="hero-badge">多场景多模型运行对比</div>
        <h1 class="hero-title">运行对比工作台</h1>
        <p class="hero-desc">
          在一个界面里对比不同专业场景、不同基础模型或不同训练方案的运行指标、推理验证产物和执行结果。
        </p>
      </div>

      <div class="hero-stats">
        <div class="hero-stat">
          <span class="hero-stat-label">共同指标</span>
          <strong class="hero-stat-value">{{ sharedMetricCount }}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-label">差异指标</span>
          <strong class="hero-stat-value">{{ differentMetricCount }}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-label">共同产物</span>
          <strong class="hero-stat-value">{{ sharedArtifactCount }}</strong>
        </div>
      </div>
    </div>

    <PanelCard title="运行选择器" subtitle="选择两次运行进行对比，并自动同步到地址栏，便于分享。">
      <div class="selector-grid">
        <div class="selector-panel">
          <span class="selector-label">方案甲</span>
          <el-select v-model="leftRunId" filterable style="width: 100%" placeholder="选择左侧运行" :loading="loading">
            <el-option v-for="item in sortedRuns" :key="`left-${item.id}`" :label="buildRunOptionLabel(item)" :value="item.id" />
          </el-select>
        </div>

        <button class="swap-button" type="button" @click="swapRuns">
          对调
        </button>

        <div class="selector-panel selector-panel--right">
          <span class="selector-label">方案乙</span>
          <el-select v-model="rightRunId" filterable style="width: 100%" placeholder="选择右侧运行" :loading="loading">
            <el-option v-for="item in sortedRuns" :key="`right-${item.id}`" :label="buildRunOptionLabel(item)" :value="item.id" />
          </el-select>
        </div>
      </div>
    </PanelCard>

    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="12" animated />
    </div>

    <template v-else-if="leftRun && rightRun">
      <div class="snapshot-grid">
        <PanelCard class="snapshot-card snapshot-card--left">
          <template #header>
            <div class="snapshot-header">
              <div>
                <div class="snapshot-kicker">方案甲</div>
                <h3 class="snapshot-title">{{ leftRun.id }}</h3>
              </div>
              <StatusBadge :status="leftRun.status" />
            </div>
          </template>

          <div class="snapshot-body">
            <div class="chip-row">
              <span class="chip">{{ leftExperiment?.base_model || '-' }}</span>
              <span class="chip">{{ formatTrainerBackend(leftExperiment?.trainer_backend) }}</span>
              <span class="chip">{{ formatRouteType(leftExperiment?.route_type) }}</span>
            </div>

            <div class="info-grid">
              <div class="info-card">
                <span class="info-label">训练 ID</span>
                <span class="info-value mono-text">{{ leftRun.experiment_id }}</span>
              </div>
              <div class="info-card">
                <span class="info-label">当前步骤</span>
                <span class="info-value">{{ formatStepText(leftRun.current_step) }}</span>
              </div>
              <div class="info-card">
                <span class="info-label">耗时</span>
                <span class="info-value mono-text">{{ formatDuration(leftRun.started_at, leftRun.finished_at, leftRun.status) }}</span>
              </div>
              <div class="info-card">
                <span class="info-label">创建时间</span>
                <span class="info-value">{{ formatDateTime(leftRun.created_at) }}</span>
              </div>
            </div>

            <div class="path-block">
              <span class="path-label">输出目录</span>
              <div class="path-value mono-text">{{ leftRun.output_dir || '暂无' }}</div>
            </div>
            <div class="path-block">
              <span class="path-label">日志路径</span>
              <div class="path-value mono-text">{{ leftRun.log_path || '暂无' }}</div>
            </div>
          </div>
        </PanelCard>

        <PanelCard class="snapshot-card snapshot-card--right">
          <template #header>
            <div class="snapshot-header">
              <div>
                <div class="snapshot-kicker">方案乙</div>
                <h3 class="snapshot-title">{{ rightRun.id }}</h3>
              </div>
              <StatusBadge :status="rightRun.status" />
            </div>
          </template>

          <div class="snapshot-body">
            <div class="chip-row">
              <span class="chip">{{ rightExperiment?.base_model || '-' }}</span>
              <span class="chip">{{ formatTrainerBackend(rightExperiment?.trainer_backend) }}</span>
              <span class="chip">{{ formatRouteType(rightExperiment?.route_type) }}</span>
            </div>

            <div class="info-grid">
              <div class="info-card">
                <span class="info-label">训练 ID</span>
                <span class="info-value mono-text">{{ rightRun.experiment_id }}</span>
              </div>
              <div class="info-card">
                <span class="info-label">当前步骤</span>
                <span class="info-value">{{ formatStepText(rightRun.current_step) }}</span>
              </div>
              <div class="info-card">
                <span class="info-label">耗时</span>
                <span class="info-value mono-text">{{ formatDuration(rightRun.started_at, rightRun.finished_at, rightRun.status) }}</span>
              </div>
              <div class="info-card">
                <span class="info-label">创建时间</span>
                <span class="info-value">{{ formatDateTime(rightRun.created_at) }}</span>
              </div>
            </div>

            <div class="path-block">
              <span class="path-label">输出目录</span>
              <div class="path-value mono-text">{{ rightRun.output_dir || '暂无' }}</div>
            </div>
            <div class="path-block">
              <span class="path-label">日志路径</span>
              <div class="path-value mono-text">{{ rightRun.log_path || '暂无' }}</div>
            </div>
          </div>
        </PanelCard>
      </div>

      <div class="compare-grid">
        <PanelCard title="指标差异矩阵" subtitle="差值按方案乙减去方案甲计算。">
          <div class="matrix">
            <div class="matrix-row matrix-row--head">
              <span>指标</span>
              <span>方案甲</span>
              <span>方案乙</span>
              <span>差值</span>
            </div>
            <div v-for="row in metricRows" :key="row.key" class="matrix-row" :class="{ 'is-different': row.isDifferent }">
              <span class="matrix-key">{{ row.key }}</span>
              <span>{{ row.leftLabel }}</span>
              <span>{{ row.rightLabel }}</span>
              <span class="delta-pill" :class="row.deltaClass">{{ row.deltaLabel }}</span>
            </div>
            <div v-if="!metricRows.length" class="empty-block">两侧都没有可用指标。</div>
          </div>
        </PanelCard>

        <PanelCard title="产物覆盖情况" subtitle="对比每次运行生成了哪些输出产物。">
          <div v-if="artifactRows.length" class="artifact-stack">
            <div v-for="row in artifactRows" :key="row.key" class="artifact-item">
              <div class="artifact-head">
                <span class="artifact-name">{{ row.key }}</span>
                <span class="artifact-state mono-text">{{ row.leftExists ? '甲' : '-' }} / {{ row.rightExists ? '乙' : '-' }}</span>
              </div>
              <div class="artifact-grid">
                <div class="artifact-box" :class="{ present: row.leftExists }">
                  <span class="artifact-side">方案甲</span>
                  <span class="artifact-path mono-text">{{ row.leftPath || '未生成' }}</span>
                </div>
                <div class="artifact-box" :class="{ present: row.rightExists }">
                  <span class="artifact-side">方案乙</span>
                  <span class="artifact-path mono-text">{{ row.rightPath || '未生成' }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-block">两侧都没有产物。</div>
        </PanelCard>
      </div>

      <div v-if="leftRun.error_message || rightRun.error_message" class="error-grid">
        <PanelCard title="方案甲错误信息">
          <pre class="error-box"><code>{{ leftRun.error_message || '无错误' }}</code></pre>
        </PanelCard>
        <PanelCard title="方案乙错误信息">
          <pre class="error-box"><code>{{ rightRun.error_message || '无错误' }}</code></pre>
        </PanelCard>
      </div>
    </template>

    <div v-else class="empty-state">
      <div class="empty-title">暂无可对比的运行</div>
      <div class="empty-desc">至少需要一条运行记录才能打开运行对比工作台。</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { fetchExperiments, fetchRuns } from '@/api/client'
import PanelCard from '@/components/ui/PanelCard.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { formatRouteType, formatStatusText, formatStepText, formatTrainerBackend } from '@/utils/display'
import { formatDateTime, formatDuration, formatMetricValue } from '@/utils/format'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const runs = ref([])
const experiments = ref([])
const leftRunId = ref('')
const rightRunId = ref('')

const experimentMap = computed(() => {
  return new Map(experiments.value.map((item) => [item.id, item]))
})

const sortedRuns = computed(() => {
  return [...runs.value].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })
})

const leftRun = computed(() => sortedRuns.value.find((item) => item.id === leftRunId.value) || null)
const rightRun = computed(() => sortedRuns.value.find((item) => item.id === rightRunId.value) || null)

const leftExperiment = computed(() => {
  return leftRun.value ? experimentMap.value.get(leftRun.value.experiment_id) || null : null
})

const rightExperiment = computed(() => {
  return rightRun.value ? experimentMap.value.get(rightRun.value.experiment_id) || null : null
})

function buildMetricKey(item) {
  const groupName = item.metric_group || '默认分组'
  return `${groupName}.${item.metric_name}`
}

const metricRows = computed(() => {
  const leftMetrics = new Map(
    (leftRun.value?.metrics || []).map((item) => [buildMetricKey(item), item.metric_value]),
  )
  const rightMetrics = new Map(
    (rightRun.value?.metrics || []).map((item) => [buildMetricKey(item), item.metric_value]),
  )
  const metricKeys = Array.from(new Set([...leftMetrics.keys(), ...rightMetrics.keys()])).sort()

  return metricKeys.map((key) => {
    const leftValue = leftMetrics.get(key)
    const rightValue = rightMetrics.get(key)
    const bothNumeric = typeof leftValue === 'number' && typeof rightValue === 'number'
    const delta = bothNumeric ? Number((rightValue - leftValue).toFixed(4)) : null

    return {
      key,
      leftLabel: leftValue === undefined ? '-' : formatMetricValue(leftValue),
      rightLabel: rightValue === undefined ? '-' : formatMetricValue(rightValue),
      deltaLabel: delta === null ? '无' : delta > 0 ? `+${delta}` : `${delta}`,
      deltaClass: delta === null ? 'delta-neutral' : delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat',
      isDifferent: leftValue !== rightValue,
    }
  })
})

const artifactRows = computed(() => {
  const leftArtifacts = new Map((leftRun.value?.artifacts || []).map((item) => [item.artifact_type, item.file_path]))
  const rightArtifacts = new Map((rightRun.value?.artifacts || []).map((item) => [item.artifact_type, item.file_path]))
  const artifactKeys = Array.from(new Set([...leftArtifacts.keys(), ...rightArtifacts.keys()])).sort()

  return artifactKeys.map((key) => ({
    key,
    leftExists: leftArtifacts.has(key),
    rightExists: rightArtifacts.has(key),
    leftPath: leftArtifacts.get(key) || '',
    rightPath: rightArtifacts.get(key) || '',
  }))
})

const sharedMetricCount = computed(() => {
  return metricRows.value.filter((item) => item.leftLabel !== '-' && item.rightLabel !== '-').length
})

const differentMetricCount = computed(() => {
  return metricRows.value.filter((item) => item.isDifferent).length
})

const sharedArtifactCount = computed(() => {
  return artifactRows.value.filter((item) => item.leftExists && item.rightExists).length
})

function buildRunOptionLabel(run) {
  const experiment = experimentMap.value.get(run.experiment_id)
  const experimentLabel = experiment?.name || run.experiment_id
  const baseModel = experiment?.base_model || '-'
  return `${run.id} | ${experimentLabel} | ${baseModel} | ${formatStatusText(run.status)}`
}

function pickFallbackIds() {
  const completedRuns = sortedRuns.value.filter((item) => item.status === 'completed')
  const primaryPool = completedRuns.length >= 2 ? completedRuns : sortedRuns.value
  const availableIds = new Set(sortedRuns.value.map((item) => item.id))
  const queryLeft = typeof route.query.left === 'string' ? route.query.left : ''
  const queryRight = typeof route.query.right === 'string' ? route.query.right : ''

  const left = availableIds.has(queryLeft) ? queryLeft : primaryPool[0]?.id || ''
  let right = availableIds.has(queryRight) ? queryRight : primaryPool[1]?.id || primaryPool[0]?.id || ''

  if (right === left) {
    right = primaryPool.find((item) => item.id !== left)?.id || right
  }

  leftRunId.value = left
  rightRunId.value = right
}

function swapRuns() {
  const previousLeft = leftRunId.value
  leftRunId.value = rightRunId.value
  rightRunId.value = previousLeft
}

async function loadData() {
  loading.value = true
  try {
    const [runList, experimentList] = await Promise.all([fetchRuns(), fetchExperiments()])
    runs.value = runList
    experiments.value = experimentList
    pickFallbackIds()
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

watch(
  [leftRunId, rightRunId],
  ([left, right]) => {
    if (!left && !right) {
      return
    }

    router.replace({
      path: '/runs/compare',
      query: {
        left: left || '',
        right: right || '',
      },
    })
  },
)

watch(
  () => route.query,
  () => {
    if (runs.value.length) {
      pickFallbackIds()
    }
  },
)

loadData()
</script>

<style scoped lang="scss">
.page-run-compare {
  padding: 32px;
  max-width: 1680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.compare-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.85fr);
  gap: 24px;
  padding: 28px;
  border-radius: 24px;
  color: #ffffff;
  background:
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.28), transparent 26%),
    linear-gradient(135deg, #0f172a 0%, #172554 46%, #2563eb 100%);
  box-shadow: 0 28px 52px rgba(15, 23, 42, 0.16);
}

.hero-badge {
  width: fit-content;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title {
  margin: 18px 0 10px;
  font-size: 34px;
  line-height: 1.02;
  letter-spacing: -0.04em;
}

.hero-desc {
  margin: 0;
  max-width: 760px;
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.7;
  font-size: 14px;
}

.hero-stats {
  display: grid;
  gap: 12px;
  align-self: end;
}

.hero-stat {
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-stat-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.72);
}

.hero-stat-value {
  font-size: 28px;
  font-weight: 700;
}

.selector-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.selector-panel {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.selector-panel--right {
  box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.08);
}

.selector-label {
  display: inline-block;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.swap-button {
  width: 72px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: #f8fafc;
  color: var(--text-primary);
  font-weight: 700;
  cursor: pointer;

  &:hover {
    border-color: #cbd5e1;
    background: #ffffff;
  }
}

.loading-state {
  padding: 12px 0;
}

.snapshot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.snapshot-card {
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
  }
}

.snapshot-card--left::after {
  background: linear-gradient(90deg, #1d4ed8 0%, #60a5fa 100%);
}

.snapshot-card--right::after {
  background: linear-gradient(90deg, #059669 0%, #34d399 100%);
}

.snapshot-header {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.snapshot-kicker {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.snapshot-title {
  margin: 8px 0 0;
  font-size: 22px;
  font-family: var(--font-mono);
  letter-spacing: -0.03em;
}

.snapshot-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-card {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--divider-color);
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-label,
.path-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}

.info-value {
  color: var(--text-primary);
  font-weight: 600;
  word-break: break-word;
}

.path-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-value {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--divider-color);
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  color: var(--text-secondary);
  word-break: break-word;
}

.compare-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.95fr;
  gap: 24px;
}

.matrix {
  display: flex;
  flex-direction: column;
}

.matrix-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--divider-color);
  font-size: 13px;

  &:last-child {
    border-bottom: none;
  }
}

.matrix-row--head {
  padding-top: 0;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}

.matrix-row.is-different {
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.04), transparent 68%);
}

.matrix-key {
  font-family: var(--font-mono);
  color: var(--text-primary);
  font-weight: 700;
}

.delta-pill {
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.delta-up {
  background: #ecfdf5;
  color: #047857;
}

.delta-down {
  background: #fef2f2;
  color: #b91c1c;
}

.delta-flat,
.delta-neutral {
  background: #f8fafc;
  color: #475569;
}

.artifact-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.artifact-item {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--divider-color);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.artifact-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.artifact-name {
  font-weight: 700;
}

.artifact-state {
  color: var(--text-muted);
  font-size: 12px;
}

.artifact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.artifact-box {
  min-height: 82px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px dashed var(--border-color);
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.artifact-box.present {
  border-style: solid;
  border-color: rgba(37, 99, 235, 0.24);
  background: #f8fbff;
}

.artifact-side {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}

.artifact-path {
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

.error-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.error-box {
  margin: 0;
  padding: 18px;
  border-radius: 16px;
  background: #0f172a;
  color: #f8fafc;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.7;
}

.empty-state,
.empty-block {
  color: var(--text-muted);
  text-align: center;
}

.empty-state {
  min-height: 40vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.empty-title {
  font-size: 20px;
  color: var(--text-primary);
  font-weight: 700;
}

.empty-desc {
  max-width: 460px;
}

.empty-block {
  padding: 22px 0;
  font-size: 14px;
}

@media (max-width: 1280px) {
  .compare-hero,
  .snapshot-grid,
  .compare-grid,
  .error-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .page-run-compare {
    padding: 20px;
  }

  .selector-grid,
  .info-grid,
  .artifact-grid,
  .matrix-row {
    grid-template-columns: 1fr;
  }

  .swap-button {
    width: 100%;
  }
}
</style>
