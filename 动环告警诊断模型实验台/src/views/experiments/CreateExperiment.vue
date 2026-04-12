<template>
  <div class="page-create-experiment">
    <div class="page-header">
      <div class="header-left">
        <el-button link @click="$router.back()" class="back-btn">
          <ArrowLeft :size="16" />
          <span>返回</span>
        </el-button>
        <h1 class="page-title">新建实验定义</h1>
      </div>
      <div class="header-actions">
        <el-button @click="$router.back()">取消</el-button>
        <el-button type="primary" @click="handleSave">保存实验</el-button>
      </div>
    </div>

    <div class="create-layout">
      <div class="form-col">
        <PanelCard title="基础信息">
          <el-form :model="form" label-position="top" class="workbench-form">
            <el-form-item label="实验名称" required>
              <el-input v-model="form.name" placeholder="请输入实验名称" />
            </el-form-item>
            
            <div class="form-row">
              <el-form-item label="业务场景" required style="flex: 1">
                <el-select v-model="form.scene" placeholder="选择场景" style="width: 100%">
                  <el-option label="动环告警诊断" value="Alarm Diagnosis" />
                  <el-option label="故障定位" value="Fault Location" />
                  <el-option label="根因分析" value="Root Cause Analysis" />
                </el-select>
              </el-form-item>
              
              <el-form-item label="基础模型" required style="flex: 1">
                <el-select v-model="form.base_model" placeholder="选择模型" style="width: 100%">
                  <el-option label="Llama-3-8B-Instruct" value="Llama-3-8B-Instruct" />
                  <el-option label="Qwen2-7B" value="Qwen2-7B" />
                  <el-option label="Mistral-7B-v0.1" value="Mistral-7B-v0.1" />
                </el-select>
              </el-form-item>
            </div>
            
            <div class="form-row">
              <el-form-item label="训练后端" required style="flex: 1">
                <el-select v-model="form.trainer_backend" placeholder="选择后端" style="width: 100%">
                  <el-option label="vLLM" value="vLLM" />
                  <el-option label="LLaMA-Factory" value="LLaMA-Factory" />
                  <el-option label="TRL" value="TRL" />
                </el-select>
              </el-form-item>
              
              <el-form-item label="路由类型" required style="flex: 1">
                <el-select v-model="form.route_type" placeholder="选择类型" style="width: 100%">
                  <el-option label="Zero-Shot" value="zero-shot" />
                  <el-option label="SFT" value="sft" />
                  <el-option label="DPO" value="dpo" />
                </el-select>
              </el-form-item>
            </div>
            
            <div class="form-row">
              <el-form-item label="训练集版本" required style="flex: 1">
                <el-input v-model="form.dataset_version" placeholder="e.g. v2.1.0" />
              </el-form-item>
              
              <el-form-item label="评估集版本" required style="flex: 1">
                <el-input v-model="form.evalset_version" placeholder="e.g. eval-v1.2" />
              </el-form-item>
            </div>
            
            <el-form-item label="Prompt 模板版本">
              <el-input v-model="form.prompt_template_version" placeholder="e.g. pt-003" />
            </el-form-item>
          </el-form>
        </PanelCard>
      </div>

      <div class="config-col">
        <PanelCard title="训练配置 (JSON)">
          <div class="json-editor-container">
            <el-input
              v-model="trainConfigStr"
              type="textarea"
              :rows="10"
              class="mono-textarea"
              placeholder='{ "learning_rate": 5e-5, ... }'
            />
          </div>
        </PanelCard>
        
        <PanelCard title="推理配置 (JSON)" style="margin-top: 24px">
          <div class="json-editor-container">
            <el-input
              v-model="inferConfigStr"
              type="textarea"
              :rows="8"
              class="mono-textarea"
              placeholder='{ "temperature": 0.1, ... }'
            />
          </div>
        </PanelCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import PanelCard from '@/components/ui/PanelCard.vue';

const router = useRouter();

const form = ref({
  name: '',
  scene: '',
  base_model: '',
  trainer_backend: '',
  route_type: '',
  dataset_version: '',
  evalset_version: '',
  prompt_template_version: '',
});

const trainConfigStr = ref('{\n  "learning_rate": 5e-5,\n  "epochs": 3,\n  "batch_size": 4,\n  "lora_rank": 8\n}');
const inferConfigStr = ref('{\n  "temperature": 0.1,\n  "max_tokens": 512,\n  "top_p": 0.9\n}');

const handleSave = () => {
  try {
    JSON.parse(trainConfigStr.value);
    JSON.parse(inferConfigStr.value);
    ElMessage.success('实验定义已保存');
    router.push('/experiments');
  } catch (e) {
    ElMessage.error('JSON 配置格式错误，请检查');
  }
};
</script>

<style lang="scss" scoped>
.page-create-experiment {
  padding: 32px;
  max-width: 1440px;
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
      
      &:hover {
        color: var(--color-accent);
      }
    }
    
    .page-title {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }
  }
  
  .header-actions {
    display: flex;
    gap: 12px;
  }
}

.create-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.form-row {
  display: flex;
  gap: 20px;
}

.mono-textarea {
  :deep(.el-textarea__inner) {
    font-family: var(--font-mono);
    font-size: 13px;
    background: #f8fafc;
    line-height: 1.6;
    padding: 12px;
  }
}

.json-editor-container {
  border-radius: var(--radius-md);
  overflow: hidden;
}
</style>
