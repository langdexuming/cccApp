<template>
  <div class="page-overview">
    <div class="page-header">
      <div>
        <h1 class="page-title">模型训练工作台</h1>
        <p class="page-desc">以模型训练为核心，统一管理多专业场景、多基础模型的训练配置、推理验证与运行对比结果。</p>
      </div>
      <el-button type="primary" @click="loadData" :loading="loading">刷新总览</el-button>
    </div>

    <div class="stats-grid">
      <PanelCard v-for="stat in stats" :key="stat.label" class="stat-card">
        <div class="stat-row">
          <div>
            <div class="stat-label">{{ stat.label }}</div>
            <div class="stat-value">{{ stat.value }}</div>
          </div>
          <div class="stat-icon" :style="{ color: stat.color, background: stat.background }">
            <component :is="stat.icon" :size="22" />
          </div>
        </div>
      </PanelCard>
    </div>

    <div class="dashboard-grid">
      <PanelCard title="最近运行" subtitle="聚合展示最近的训练、验证与对比运行记录。">
        <el-table :data="recentRuns" class="workbench-table" style="width: 100%">
          <el-table-column prop="id" label="运行 ID" width="220">
            <template #default="{ row }">
              <span class="mono-text">{{ row.id }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="120">
            <template #default="{ row }">
              <StatusBadge :status="row.status" />
            </template>
          </el-table-column>
          <el-table-column prop="current_step" label="当前步骤" min-width="220">
            <template #default="{ row }">
              {{ formatStepText(row.current_step) }}
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="180">
            <template #default="{ row }">
              {{ formatDateTime(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110">
            <template #default="{ row }">
              <el-button link type="primary" @click="$router.push(`/runs/${row.id}`)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </PanelCard>

      <div class="right-column">
        <PanelCard title="快捷入口">
          <div class="quick-actions">
            <el-button class="action-button" @click="$router.push('/experiments/create')">新建训练</el-button>
            <el-button class="action-button" @click="$router.push('/runs/compare')">运行对比</el-button>
            <el-button class="action-button" @click="$router.push('/runs')">打开运行列表</el-button>
          </div>
        </PanelCard>

        <PanelCard title="训练概况">
          <div class="health-list">
            <div class="health-item">
              <span class="health-label">接口状态</span>
              <StatusBadge :status="healthStatus" :label="healthStatusLabel" />
            </div>
            <div class="health-item">
              <span class="health-label">运行环境</span>
              <span>{{ healthEnvLabel }}</span>
            </div>
            <div class="health-item">
              <span class="health-label">训练数量</span>
              <span class="mono-text">{{ experiments.length }}</span>
            </div>
            <div class="health-item">
              <span class="health-label">运行数量</span>
              <span class="mono-text">{{ runs.length }}</span>
            </div>
          </div>
        </PanelCard>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Activity, CheckCircle2, FlaskConical, Play } from 'lucide-vue-next'

import { fetchExperiments, fetchHealth, fetchRuns } from '@/api/client'
import PanelCard from '@/components/ui/PanelCard.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { formatEnvLabel, formatStepText } from '@/utils/display'
import { formatDateTime } from '@/utils/format'

const experiments = ref([])
const runs = ref([])
const health = ref(null)
const loading = ref(false)

const stats = computed(() => [
  {
    label: '训练数',
    value: experiments.value.length,
    icon: FlaskConical,
    color: '#2563eb',
    background: '#dbeafe',
  },
  {
    label: '运行中',
    value: runs.value.filter((item) => item.status === 'running').length,
    icon: Play,
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
    icon: Activity,
    color: '#b91c1c',
    background: '#fee2e2',
  },
])

const recentRuns = computed(() => runs.value.slice(0, 5))
const healthStatus = computed(() => (health.value?.status === 'ok' ? 'online' : 'failed'))
const healthStatusLabel = computed(() => (health.value?.status === 'ok' ? '健康' : '不可用'))
const healthEnvLabel = computed(() => formatEnvLabel(health.value?.env || 'unknown'))

async function loadData() {
  loading.value = true
  try {
    const [experimentList, runList, healthInfo] = await Promise.all([
      fetchExperiments(),
      fetchRuns(),
      fetchHealth().catch(() => null),
    ])
    experiments.value = experimentList
    runs.value = runList
    health.value = healthInfo
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped lang="scss">
.page-overview {
  padding: 32px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
}

.page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.page-desc {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
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
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-button {
  justify-content: flex-start;
}

.health-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.health-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.health-label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

@media (max-width: 1200px) {
  .stats-grid,
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .page-overview {
    padding: 20px;
  }

  .page-header {
    flex-direction: column;
  }
}
</style>
