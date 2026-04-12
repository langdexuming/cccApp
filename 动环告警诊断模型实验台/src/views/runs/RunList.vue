<template>
  <div class="page-runs">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">Run Records</h1>
        <p class="page-desc">Track execution status, artifact coverage, and evaluation readiness for every run.</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" plain @click="$router.push('/runs/compare')">
          <GitCompareArrows :size="16" style="margin-right: 8px" />
          Compare Runs
        </el-button>
      </div>
    </div>

    <PanelCard no-padding>
      <div class="table-toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="searchQuery"
            placeholder="Search run ID..."
            style="width: 240px"
            clearable
          >
            <template #prefix>
              <Search :size="14" />
            </template>
          </el-input>

          <el-select v-model="statusFilter" placeholder="Status" style="width: 140px" clearable>
            <el-option label="Pending" value="pending" />
            <el-option label="Running" value="running" />
            <el-option label="Completed" value="completed" />
            <el-option label="Failed" value="failed" />
          </el-select>
        </div>

        <div class="toolbar-right">
          <el-button link @click="refreshData">
            <RefreshCw :size="16" />
          </el-button>
        </div>
      </div>

      <el-table :data="filteredRuns" style="width: 100%" class="workbench-table">
        <el-table-column prop="id" label="Run ID" width="220">
          <template #default="{ row }">
            <span class="mono-text">{{ row.id }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="experiment_id" label="Experiment ID" width="180">
          <template #default="{ row }">
            <span class="mono-text">{{ row.experiment_id }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="Status" width="120">
          <template #default="{ row }">
            <StatusBadge :status="row.status" />
          </template>
        </el-table-column>

        <el-table-column prop="current_step" label="Current Step" min-width="260">
          <template #default="{ row }">
            <div class="step-cell">
              <span class="step-text">{{ row.current_step || '-' }}</span>
              <el-progress
                v-if="row.status === 'running'"
                :percentage="56"
                :show-text="false"
                :stroke-width="4"
                style="margin-top: 4px"
              />
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Coverage" width="150">
          <template #default="{ row }">
            <div class="stats-cell">
              <span class="stat-item" title="Artifacts">
                <Package :size="12" /> {{ row.artifacts.length }}
              </span>
              <span class="stat-item" title="Metrics">
                <BarChart3 :size="12" /> {{ row.metrics.length }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="created_at" label="Created At" width="180" />

        <el-table-column fixed="right" label="Actions" width="160">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/runs/${row.id}`)">Detail</el-button>
            <el-button link type="info" @click="$router.push(`/runs/compare?left=${row.id}&right=${comparePartnerId(row.id)}`)">
              Compare
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="table-pagination">
        <el-pagination
          layout="total, sizes, prev, pager, next"
          :total="filteredRuns.length"
          :page-size="20"
        />
      </div>
    </PanelCard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { BarChart3, GitCompareArrows, Package, RefreshCw, Search } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import PanelCard from '@/components/ui/PanelCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { mockRuns } from '@/api/mock';

const searchQuery = ref('');
const statusFilter = ref('');

const filteredRuns = computed(() => {
  return mockRuns.filter((run) => {
    const matchesSearch =
      run.id.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      run.experiment_id.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesStatus = !statusFilter.value || run.status === statusFilter.value;
    return matchesSearch && matchesStatus;
  });
});

const refreshData = () => {
  ElMessage.success('Run data refreshed.');
};

const comparePartnerId = (runId: string) => {
  const partner = mockRuns.find((item) => item.id !== runId && item.status === 'completed');
  return partner?.id || mockRuns.find((item) => item.id !== runId)?.id || runId;
};
</script>

<style lang="scss" scoped>
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
  margin-bottom: 32px;

  .page-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
  }

  .page-desc {
    margin: 8px 0 0;
    color: var(--text-secondary);
    font-size: 14px;
  }
}

.table-toolbar {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--divider-color);

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

.step-cell {
  display: flex;
  flex-direction: column;

  .step-text {
    font-size: 13px;
    color: var(--text-secondary);
  }
}

.stats-cell {
  display: flex;
  gap: 12px;

  .stat-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
}

.table-pagination {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .page-runs {
    padding: 20px;
  }

  .page-header {
    flex-direction: column;
  }

  .table-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;

    .toolbar-left {
      flex-direction: column;
      align-items: stretch;
    }
  }
}
</style>
