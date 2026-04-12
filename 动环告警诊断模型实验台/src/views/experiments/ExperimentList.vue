<template>
  <div class="page-experiments">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">实验管理</h1>
        <p class="page-desc">定义并管理模型实验配置</p>
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="$router.push('/experiments/create')">
          <Plus :size="16" style="margin-right: 8px" />
          新建实验
        </el-button>
      </div>
    </div>

    <PanelCard no-padding>
      <div class="table-toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="searchQuery"
            placeholder="搜索实验名称..."
            style="width: 240px"
            clearable
          >
            <template #prefix>
              <Search :size="14" />
            </template>
          </el-input>
          
          <el-select v-model="statusFilter" placeholder="状态筛选" style="width: 120px" clearable>
            <el-option label="草稿" value="draft" />
            <el-option label="队列中" value="queued" />
            <el-option label="运行中" value="running" />
            <el-option label="已完成" value="completed" />
            <el-option label="失败" value="failed" />
          </el-select>
        </div>
        
        <div class="toolbar-right">
          <el-button link @click="refreshData">
            <RefreshCw :size="16" />
          </el-button>
        </div>
      </div>

      <el-table :data="filteredExperiments" style="width: 100%" class="workbench-table">
        <el-table-column prop="name" label="实验名称" min-width="220">
          <template #default="{ row }">
            <div class="exp-name-cell">
              <span class="exp-name">{{ row.name }}</span>
              <span class="exp-id mono-text">{{ row.id }}</span>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="base_model" label="基础模型" width="180">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" type="info">{{ row.base_model }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column prop="trainer_backend" label="训练后端" width="140" />
        
        <el-table-column prop="route_type" label="路由类型" width="120">
          <template #default="{ row }">
            <span class="route-type">{{ row.route_type }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <StatusBadge :status="row.status" />
          </template>
        </el-table-column>
        
        <el-table-column prop="updated_at" label="最后更新" width="180" />
        
        <el-table-column fixed="right" label="操作" width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="startRun(row)">发起 Run</el-button>
            <el-dropdown trigger="click">
              <el-button link type="info">
                <MoreHorizontal :size="16" />
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item>编辑配置</el-dropdown-item>
                  <el-dropdown-item>克隆实验</el-dropdown-item>
                  <el-dropdown-item divided style="color: var(--state-failed)">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      
      <div class="table-pagination">
        <el-pagination
          layout="total, sizes, prev, pager, next"
          :total="filteredExperiments.length"
          :page-size="20"
        />
      </div>
    </PanelCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  Plus, 
  Search, 
  RefreshCw, 
  MoreHorizontal 
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import PanelCard from '@/components/ui/PanelCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { mockExperiments } from '@/api/mock';
import type { Experiment } from '@/types';

const searchQuery = ref('');
const statusFilter = ref('');

const filteredExperiments = computed(() => {
  return mockExperiments.filter(exp => {
    const matchesSearch = exp.name.toLowerCase().includes(searchQuery.value.toLowerCase()) || 
                         exp.id.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesStatus = !statusFilter.value || exp.status === statusFilter.value;
    return matchesSearch && matchesStatus;
  });
});

const refreshData = () => {
  ElMessage.success('数据已刷新');
};

const startRun = (exp: Experiment) => {
  ElMessage.success(`已为实验 ${exp.name} 发起新的运行任务`);
};
</script>

<style lang="scss" scoped>
.page-experiments {
  padding: 32px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.exp-name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  
  .exp-name {
    font-weight: 500;
    color: var(--text-primary);
  }
  
  .exp-id {
    font-size: 11px;
    color: var(--text-muted);
  }
}

.route-type {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  text-transform: uppercase;
}

.table-pagination {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
