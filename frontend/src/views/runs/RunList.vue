<template>
  <div class="page-runs">
    <div class="page-header">
      <div>
        <h1 class="page-title">运行列表</h1>
        <p class="page-desc">查看所有运行任务的训练执行、产物输出和评测覆盖情况。</p>
      </div>
      <div class="page-actions">
        <el-button :loading="loading" @click="loadRuns">刷新</el-button>
        <el-button type="primary" plain @click="$router.push('/runs/compare')">运行对比</el-button>
      </div>
    </div>

    <div class="stats-grid">
      <PanelCard v-for="stat in stats" :key="stat.label" class="stat-card">
        <div class="stat-row">
          <div>
            <div class="stat-label">{{ stat.label }}</div>
            <div class="stat-value">{{ stat.value }}</div>
          </div>
          <div class="stat-icon" :style="{ color: stat.color, background: stat.background }">
            <component :is="stat.icon" :size="20" />
          </div>
        </div>
      </PanelCard>
    </div>

    <PanelCard no-padding>
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="searchQuery"
            placeholder="搜索运行、训练或模型名称..."
            clearable
            style="width: 320px"
          />
          <el-select v-model="statusFilter" placeholder="状态" clearable style="width: 150px">
            <el-option label="待处理" value="pending" />
            <el-option label="运行中" value="running" />
            <el-option label="已完成" value="completed" />
            <el-option label="失败" value="failed" />
          </el-select>
        </div>
      </div>

      <el-table :data="filteredRuns" class="workbench-table" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="运行 ID" min-width="220">
          <template #default="{ row }">
            <div class="run-cell">
              <div class="run-id mono-text">{{ row.id }}</div>
              <div class="run-sub">第 {{ row.run_no }} 次运行</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="训练" min-width="280">
          <template #default="{ row }">
            <div class="experiment-cell">
              <div class="experiment-name">{{ getExperiment(row.experiment_id)?.name || row.experiment_id }}</div>
              <div class="experiment-meta">
                <span class="mono-text">{{ row.experiment_id }}</span>
                <span class="dot-sep">/</span>
                <span>{{ getExperiment(row.experiment_id)?.base_model || '-' }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <StatusBadge :status="row.status" />
          </template>
        </el-table-column>

        <el-table-column prop="current_step" label="当前步骤" min-width="220">
          <template #default="{ row }">
            <span class="step-text">{{ formatStepText(row.current_step) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="覆盖情况" width="170">
          <template #default="{ row }">
            <div class="coverage-cell">
              <span class="coverage-item">产物 {{ row.artifacts.length }}</span>
              <span class="coverage-item">指标 {{ row.metrics.length }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="耗时" width="130">
          <template #default="{ row }">
            <span class="mono-text">{{ formatDuration(row.started_at, row.finished_at, row.status) }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/runs/${row.id}`)">详情</el-button>
            <el-button link @click="$router.push(buildCompareRoute(row.id))">对比</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state">
            <div class="empty-title">暂无运行记录</div>
            <div class="empty-desc">请先创建训练，再从训练列表中启动运行任务。</div>
          </div>
        </template>
      </el-table>
    </PanelCard>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Activity, CheckCircle2, Clock3, XCircle } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'

import { fetchExperiments, fetchRuns } from '@/api/client'
import PanelCard from '@/components/ui/PanelCard.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { formatStepText } from '@/utils/display'
import { formatDateTime, formatDuration } from '@/utils/format'

const loading = ref(false)
const runs = ref([])
const experiments = ref([])
const searchQuery = ref('')
const statusFilter = ref('')

const experimentMap = computed(() => {
  return new Map(experiments.value.map((item) => [item.id, item]))
})

const sortedRuns = computed(() => {
  return [...runs.value].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })
})

const filteredRuns = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return sortedRuns.value.filter((item) => {
    const experiment = experimentMap.value.get(item.experiment_id)
    const matchesQuery =
      !query ||
      item.id.toLowerCase().includes(query) ||
      item.experiment_id.toLowerCase().includes(query) ||
      String(experiment?.name || '').toLowerCase().includes(query) ||
      String(experiment?.base_model || '').toLowerCase().includes(query)

    const matchesStatus = !statusFilter.value || item.status === statusFilter.value
    return matchesQuery && matchesStatus
  })
})

const stats = computed(() => [
  {
    label: '运行总数',
    value: runs.value.length,
    icon: Clock3,
    color: '#2563eb',
    background: '#dbeafe',
  },
  {
    label: '运行中',
    value: runs.value.filter((item) => item.status === 'running').length,
    icon: Activity,
    color: '#b45309',
    background: '#fef3c7',
  },
  {
    label: '已完成',
    value: runs.value.filter((item) => item.status === 'completed').length,
    icon: CheckCircle2,
    color: '#047857',
    background: '#d1fae5',
  },
  {
    label: '失败数',
    value: runs.value.filter((item) => item.status === 'failed').length,
    icon: XCircle,
    color: '#b91c1c',
    background: '#fee2e2',
  },
])

function getExperiment(experimentId) {
  return experimentMap.value.get(experimentId) || null
}

function buildCompareRoute(runId) {
  const partner =
    sortedRuns.value.find((item) => item.id !== runId && item.status === 'completed') ||
    sortedRuns.value.find((item) => item.id !== runId)

  return {
    path: '/runs/compare',
    query: {
      left: runId,
      right: partner?.id || runId,
    },
  }
}

async function loadRuns() {
  loading.value = true
  try {
    const [runList, experimentList] = await Promise.all([fetchRuns(), fetchExperiments()])
    runs.value = runList
    experiments.value = experimentList
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

onMounted(loadRuns)
</script>

<style scoped lang="scss">
.page-runs {
  padding: 32px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
}

.page-desc {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.page-actions {
  display: flex;
  gap: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stat-value {
  margin-top: 8px;
  font-size: 30px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar {
  padding: 18px 20px;
  border-bottom: 1px solid var(--divider-color);
}

.toolbar-left {
  display: flex;
  gap: 12px;
}

.run-cell,
.experiment-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.run-id,
.experiment-name {
  font-weight: 700;
}

.run-sub,
.experiment-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.dot-sep {
  margin: 0 6px;
}

.step-text {
  color: var(--text-secondary);
}

.coverage-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.coverage-item {
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.empty-state {
  padding: 42px 20px;
  text-align: center;
}

.empty-title {
  font-size: 16px;
  font-weight: 700;
}

.empty-desc {
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 13px;
}

@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .page-runs {
    padding: 20px;
  }

  .page-header,
  .toolbar-left {
    flex-direction: column;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
