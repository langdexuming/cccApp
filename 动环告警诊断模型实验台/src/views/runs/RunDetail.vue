<template>
  <div v-if="run" class="page-run-detail">
    <div class="page-header">
      <div class="header-left">
        <el-button link @click="$router.back()" class="back-btn">
          <ArrowLeft :size="16" />
          <span>返回列表</span>
        </el-button>
        <div class="title-group">
          <h1 class="page-title">Run: {{ run.id }}</h1>
          <StatusBadge :status="run.status" />
        </div>
      </div>
      <div class="header-actions">
        <el-button v-if="run.status === 'running'" type="danger" plain>停止运行</el-button>
        <el-button v-else type="primary">重新运行</el-button>
      </div>
    </div>

    <div class="detail-grid">
      <!-- Top Summary -->
      <PanelCard class="summary-card">
        <div class="summary-grid">
          <div class="summary-item">
            <span class="label">实验 ID</span>
            <span class="value mono-text">{{ run.experiment_id }}</span>
          </div>
          <div class="summary-item">
            <span class="label">当前步骤</span>
            <span class="value">{{ run.current_step || '-' }}</span>
          </div>
          <div class="summary-item">
            <span class="label">创建时间</span>
            <span class="value">{{ run.created_at }}</span>
          </div>
          <div class="summary-item">
            <span class="label">运行时长</span>
            <span class="value">{{ duration }}</span>
          </div>
        </div>
      </PanelCard>

      <!-- Error Message if failed -->
      <div v-if="run.status === 'failed' && run.error_message" class="error-panel">
        <div class="error-header">
          <AlertTriangle :size="18" />
          <span>运行错误</span>
        </div>
        <div class="error-body">
          <pre><code>{{ run.error_message }}</code></pre>
        </div>
      </div>

      <div class="main-content">
        <div class="left-col">
          <!-- Metrics -->
          <PanelCard title="运行指标 (Metrics)">
            <div v-if="run.metrics.length > 0" class="metrics-grid">
              <div v-for="metric in run.metrics" :key="metric.id" class="metric-tile">
                <span class="m-group">{{ metric.metric_group }}</span>
                <span class="m-name">{{ metric.metric_name }}</span>
                <span class="m-value">{{ formatMetric(metric.metric_value) }}</span>
              </div>
            </div>
            <div v-else class="empty-state">暂无指标数据</div>
          </PanelCard>

          <!-- Artifacts -->
          <PanelCard title="产物列表 (Artifacts)" style="margin-top: 24px">
            <div v-if="run.artifacts.length > 0" class="artifacts-list">
              <div v-for="art in run.artifacts" :key="art.id" class="artifact-item">
                <div class="art-icon">
                  <FileCode v-if="art.artifact_type === 'model_weight'" :size="18" />
                  <FileJson v-else :size="18" />
                </div>
                <div class="art-info">
                  <span class="art-type">{{ art.artifact_type }}</span>
                  <span class="art-path mono-text">{{ art.file_path }}</span>
                </div>
                <el-button link type="primary">下载</el-button>
              </div>
            </div>
            <div v-else class="empty-state">暂无产物</div>
          </PanelCard>
        </div>

        <div class="right-col">
          <!-- Paths & Logs -->
          <PanelCard title="执行环境">
            <div class="path-group">
              <div class="path-item">
                <span class="label">输出目录</span>
                <div class="path-box mono-text">
                  <span>{{ run.output_dir || 'N/A' }}</span>
                  <Copy :size="14" class="copy-icon" />
                </div>
              </div>
              <div class="path-item">
                <span class="label">日志路径</span>
                <div class="path-box mono-text">
                  <span>{{ run.log_path || 'N/A' }}</span>
                  <Copy :size="14" class="copy-icon" />
                </div>
              </div>
            </div>
            <el-button class="view-log-btn">
              <Terminal :size="16" />
              <span>查看实时日志</span>
            </el-button>
          </PanelCard>

          <!-- Experiment Config Snapshot -->
          <PanelCard title="实验配置快照" style="margin-top: 24px">
            <JsonBlock :data="experimentConfig" label="Experiment Config" />
          </PanelCard>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="loading-state">
    <el-skeleton :rows="10" animated />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { 
  ArrowLeft, 
  AlertTriangle, 
  Copy, 
  Terminal, 
  FileCode, 
  FileJson 
} from 'lucide-vue-next';
import PanelCard from '@/components/ui/PanelCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import JsonBlock from '@/components/ui/JsonBlock.vue';
import { mockRuns, mockExperiments } from '@/api/mock';
import type { Run } from '@/types';

const route = useRoute();
const run = ref<Run | null>(null);

onMounted(() => {
  const id = route.params.id as string;
  run.value = mockRuns.find(r => r.id === id) || null;
});

const experimentConfig = computed(() => {
  if (!run.value) return {};
  const exp = mockExperiments.find(e => e.id === run.value?.experiment_id);
  return exp || {};
});

const duration = computed(() => {
  if (!run.value?.started_at) return '-';
  if (run.value.finished_at) return '45m 12s'; // Mocked duration
  return 'Running...';
});

const formatMetric = (val: number) => {
  if (val < 1 && val > 0) return val.toFixed(4);
  return val.toString();
};
</script>

<style lang="scss" scoped>
.page-run-detail {
  padding: 32px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
  
  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
    
    .back-btn {
      padding: 0;
      height: auto;
      color: var(--text-secondary);
    }
    
    .title-group {
      display: flex;
      align-items: center;
      gap: 12px;
      
      .page-title {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
        font-family: var(--font-mono);
      }
    }
  }
}

.summary-card {
  margin-bottom: 24px;
  
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
  }
  
  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    .label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    
    .value {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }
  }
}

.error-panel {
  background: #fef2f2;
  border: 1px solid #fee2e2;
  border-radius: var(--radius-md);
  margin-bottom: 24px;
  overflow: hidden;
  
  .error-header {
    background: #fee2e2;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #b91c1c;
    font-weight: 600;
    font-size: 14px;
  }
  
  .error-body {
    padding: 16px;
    
    pre {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 13px;
      color: #b91c1c;
      white-space: pre-wrap;
    }
  }
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 24px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.metric-tile {
  background: #f8fafc;
  border: 1px solid var(--divider-color);
  padding: 16px;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  .m-group {
    font-size: 10px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  
  .m-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
  }
  
  .m-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    font-family: var(--font-mono);
    margin-top: 4px;
  }
}

.artifacts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.artifact-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid var(--divider-color);
  border-radius: var(--radius-md);
  
  .art-icon {
    width: 36px;
    height: 36px;
    background: white;
    border: 1px solid var(--divider-color);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }
  
  .art-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    
    .art-type {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .art-path {
      font-size: 11px;
      color: var(--text-muted);
    }
  }
}

.path-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.path-item {
  .label {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 6px;
    font-weight: 600;
  }
  
  .path-box {
    background: #f1f5f9;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    
    .copy-icon {
      color: var(--text-muted);
      cursor: pointer;
      &:hover { color: var(--color-accent); }
    }
  }
}

.view-log-btn {
  width: 100%;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 14px;
}

.loading-state {
  padding: 32px;
}
</style>
