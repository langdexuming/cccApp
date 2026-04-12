<template>
  <div class="page-overview">
    <div class="page-header">
      <h1 class="page-title">实验台概览</h1>
      <p class="page-desc">监控系统运行状态与实验进展</p>
    </div>

    <div class="stats-grid">
      <PanelCard v-for="stat in stats" :key="stat.label" class="stat-card">
        <div class="stat-content">
          <div class="stat-info">
            <span class="stat-label">{{ stat.label }}</span>
            <span class="stat-value">{{ stat.value }}</span>
          </div>
          <div class="stat-icon" :style="{ color: stat.color, background: stat.bg }">
            <component :is="stat.icon" :size="24" />
          </div>
        </div>
      </PanelCard>
    </div>

    <div class="dashboard-main">
      <div class="left-col">
        <PanelCard title="最近运行记录" no-padding>
          <template #extra>
            <el-button link type="primary" @click="$router.push('/runs')">查看全部</el-button>
          </template>
          <el-table :data="recentRuns" style="width: 100%" class="workbench-table">
            <el-table-column prop="id" label="Run ID" width="180">
              <template #default="{ row }">
                <span class="mono-text">{{ row.id }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="120">
              <template #default="{ row }">
                <StatusBadge :status="row.status" />
              </template>
            </el-table-column>
            <el-table-column prop="current_step" label="当前步骤" min-width="200">
              <template #default="{ row }">
                <span class="step-text">{{ row.current_step || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="180" />
            <el-table-column fixed="right" label="操作" width="100">
              <template #default="{ row }">
                <el-button link type="primary" @click="$router.push(`/runs/${row.id}`)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </PanelCard>
      </div>

      <div class="right-col">
        <PanelCard title="快捷操作">
          <div class="quick-actions">
            <el-button class="action-btn" @click="$router.push('/experiments/create')">
              <Plus :size="16" />
              <span>新建实验定义</span>
            </el-button>
            <el-button class="action-btn">
              <RefreshCcw :size="16" />
              <span>同步数据集</span>
            </el-button>
            <el-button class="action-btn">
              <Settings :size="16" />
              <span>系统配置</span>
            </el-button>
          </div>
        </PanelCard>

        <PanelCard title="系统健康度" class="health-card">
          <div class="health-item">
            <span class="label">API Server</span>
            <StatusBadge status="online" label="Healthy" />
          </div>
          <div class="health-item">
            <span class="label">Worker Node</span>
            <StatusBadge status="online" label="3 Active" />
          </div>
          <div class="health-item">
            <span class="label">GPU Cluster</span>
            <StatusBadge status="running" label="85% Load" />
          </div>
        </PanelCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { 
  Plus, 
  RefreshCcw, 
  Settings, 
  FlaskConical, 
  Play, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-vue-next';
import PanelCard from '@/components/ui/PanelCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { mockExperiments, mockRuns } from '@/api/mock';

const recentRuns = computed(() => mockRuns.slice(0, 5));

const stats = [
  { 
    label: '实验总数', 
    value: mockExperiments.length, 
    icon: FlaskConical, 
    color: '#3b82f6', 
    bg: '#eff6ff' 
  },
  { 
    label: '正在运行', 
    value: mockRuns.filter(r => r.status === 'running').length, 
    icon: Play, 
    color: '#f59e0b', 
    bg: '#fffbeb' 
  },
  { 
    label: '已完成', 
    value: mockRuns.filter(r => r.status === 'completed').length, 
    icon: CheckCircle2, 
    color: '#10b981', 
    bg: '#ecfdf5' 
  },
  { 
    label: '运行失败', 
    value: mockRuns.filter(r => r.status === 'failed').length, 
    icon: AlertCircle, 
    color: '#ef4444', 
    bg: '#fef2f2' 
  },
];
</script>

<style lang="scss" scoped>
.page-overview {
  padding: 32px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 32px;
  
  .page-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
  }
  
  .page-desc {
    margin: 8px 0 0;
    color: var(--text-secondary);
    font-size: 14px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.stat-card {
  .stat-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .stat-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    .stat-label {
      font-size: 13px;
      color: var(--text-secondary);
      font-weight: 500;
    }
    
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
      font-family: var(--font-mono);
    }
  }
  
  .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.dashboard-main {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
}

.left-col {
  min-width: 0;
}

.right-col {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  
  .action-btn {
    width: 100%;
    justify-content: flex-start;
    gap: 10px;
    height: 40px;
    margin: 0;
  }
}

.health-card {
  .health-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--divider-color);
    
    &:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    
    &:first-child {
      padding-top: 0;
    }
    
    .label {
      font-size: 13px;
      color: var(--text-secondary);
      font-weight: 500;
    }
  }
}

.step-text {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
