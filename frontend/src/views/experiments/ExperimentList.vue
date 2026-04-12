<template>
  <div class="page-experiments">
    <div class="page-header">
      <div>
        <h1 class="page-title">训练列表</h1>
        <p class="page-desc">统一管理多专业场景、多基础模型的训练任务、配置预设，以及推理验证与对比流程。</p>
      </div>
      <div class="page-actions">
        <el-button @click="loadExperiments" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="$router.push('/experiments/create')">新建训练</el-button>
      </div>
    </div>

    <PanelCard no-padding>
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input v-model="searchQuery" placeholder="搜索训练名称或 ID..." clearable style="width: 260px" />
          <el-select v-model="statusFilter" placeholder="状态" clearable style="width: 140px">
            <el-option label="草稿" value="draft" />
            <el-option label="排队中" value="queued" />
            <el-option label="运行中" value="running" />
            <el-option label="已完成" value="completed" />
            <el-option label="失败" value="failed" />
          </el-select>
        </div>
      </div>

      <el-table :data="filteredExperiments" class="workbench-table" style="width: 100%" v-loading="loading">
        <el-table-column prop="name" label="训练名称" min-width="260">
          <template #default="{ row }">
            <div class="name-cell">
              <div class="name-text">{{ row.name }}</div>
              <div class="name-sub mono-text">{{ row.id }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="base_model" label="基础模型" width="220" />
        <el-table-column prop="trainer_backend" label="训练方案" width="170">
          <template #default="{ row }">
            {{ formatTrainerBackend(row.trainer_backend) }}
          </template>
        </el-table-column>
        <el-table-column prop="route_type" label="执行类型" width="140">
          <template #default="{ row }">
            <span class="route-pill">{{ formatRouteType(row.route_type) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <StatusBadge :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column prop="updated_at" label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.updated_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :loading="runLaunchingId === row.id" @click="startRun(row.id)">
              启动运行
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </PanelCard>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import { createRun, fetchExperiments } from '@/api/client'
import PanelCard from '@/components/ui/PanelCard.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { formatRouteType, formatTrainerBackend } from '@/utils/display'
import { formatDateTime } from '@/utils/format'

const experiments = ref([])
const loading = ref(false)
const runLaunchingId = ref('')
const searchQuery = ref('')
const statusFilter = ref('')

const filteredExperiments = computed(() => {
  return experiments.value.filter((item) => {
    const query = searchQuery.value.trim().toLowerCase()
    const matchesQuery = !query || item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query)
    const matchesStatus = !statusFilter.value || item.status === statusFilter.value
    return matchesQuery && matchesStatus
  })
})

async function loadExperiments() {
  loading.value = true
  try {
    experiments.value = await fetchExperiments()
  } finally {
    loading.value = false
  }
}

async function startRun(experimentId) {
  runLaunchingId.value = experimentId
  try {
    const run = await createRun(experimentId)
    ElMessage.success(`已创建运行：${run.id}`)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    runLaunchingId.value = ''
    loadExperiments()
  }
}

onMounted(loadExperiments)
</script>

<style scoped lang="scss">
.page-experiments {
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

.toolbar {
  padding: 18px 20px;
  border-bottom: 1px solid var(--divider-color);
}

.toolbar-left {
  display: flex;
  gap: 12px;
}

.name-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-text {
  font-weight: 700;
}

.name-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.route-pill {
  display: inline-flex;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 900px) {
  .page-experiments {
    padding: 20px;
  }

  .page-header,
  .toolbar-left {
    flex-direction: column;
  }
}
</style>
