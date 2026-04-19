<template>
  <div class="page-create-experiment">
    <div class="page-header">
      <div>
        <h1 class="page-title">新建训练</h1>
        <p class="page-desc">定义面向多专业场景、多基础模型的训练任务，并支持推理验证与运行对比扩展。</p>
      </div>
      <div class="page-actions">
        <el-button @click="$router.back()">取消</el-button>
        <el-button :loading="submitting" @click="saveExperiment(false)">保存</el-button>
        <el-button type="primary" :loading="submitting" @click="saveExperiment(true)">保存并运行</el-button>
      </div>
    </div>

    <div class="form-grid">
      <PanelCard title="基础定义" subtitle="这些核心字段会直接映射到后端训练配置。">
        <el-form :model="form" label-position="top" class="workbench-form">
          <el-form-item label="训练名称">
            <el-input v-model="form.name" placeholder="通用模型训练任务" />
          </el-form-item>

          <div class="form-row">
            <el-form-item label="场景" class="grow">
              <el-select
                v-model="form.scene"
                filterable
                allow-create
                default-first-option
                style="width: 100%"
                placeholder="输入或选择专业场景"
              >
                <el-option v-for="scene in sceneOptions" :key="scene" :label="scene" :value="scene" />
              </el-select>
            </el-form-item>
            <el-form-item label="执行类型" class="grow">
              <el-select v-model="form.route_type" style="width: 100%">
                <el-option label="监督微调" value="sft" />
                <el-option label="基线推理" value="baseline_infer" />
              </el-select>
            </el-form-item>
          </div>

          <div class="form-row">
            <el-form-item label="基础模型" class="grow">
              <el-select
                v-model="form.base_model"
                filterable
                allow-create
                default-first-option
                style="width: 100%"
                placeholder="输入或选择基础模型"
              >
                <el-option
                  v-for="model in baseModelOptions"
                  :key="model"
                  :label="model"
                  :value="model"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="训练方案" class="grow">
              <el-select v-model="form.trainer_backend" style="width: 100%">
                <el-option label="LLaMA-Factory 方案" value="llamafactory" />
                <el-option label="ms-swift 方案" value="swift" />
              </el-select>
            </el-form-item>
          </div>

          <div class="form-row">
            <el-form-item label="训练集版本" class="grow">
              <el-input v-model="form.dataset_version" />
            </el-form-item>
            <el-form-item label="评测集版本" class="grow">
              <el-input v-model="form.evalset_version" />
            </el-form-item>
          </div>

          <el-form-item label="提示词模板版本">
            <el-input v-model="form.prompt_template_version" />
          </el-form-item>
        </el-form>
      </PanelCard>

      <div class="config-stack">
        <PanelCard title="训练配置 JSON" subtitle="后端会将该配置块保存为 train_config。">
          <el-input
            v-model="trainConfigText"
            type="textarea"
            :rows="14"
            class="json-textarea"
          />
        </PanelCard>

        <PanelCard title="推理配置 JSON" subtitle="后端会将该配置块保存为 infer_config。">
          <el-input
            v-model="inferConfigText"
            type="textarea"
            :rows="10"
            class="json-textarea"
          />
        </PanelCard>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { createExperiment, createRun } from '@/api/client'
import PanelCard from '@/components/ui/PanelCard.vue'

const router = useRouter()
const submitting = ref(false)

const sceneOptions = ['告警诊断', '通用场景']
const baseModelOptions = [
  'Qwen/Qwen3.5-2B-Base',
  'Qwen/Qwen3.5-2B',
  'Qwen/Qwen3.5-9B-Base',
  'Qwen/Qwen3.5-9B',
]

const LLAMA_FACTORY_TRAIN_PRESET = {
  template: 'qwen',
  num_train_epochs: 1,
  cutoff_len: 4096,
  per_device_train_batch_size: 1,
  gradient_accumulation_steps: 4,
  lora_rank: 32,
  lora_alpha: 64,
  gradient_checkpointing: true,
  overwrite_cache: true,
  plot_loss: false,
  use_modelscope_hub: true,
}

const LLAMA_FACTORY_INFER_PRESET = {
  auto_gguf: true,
  gguf_outtype: 'f16',
  skip_ollama: false,
  skip_eval: false,
  skip_benchmark: false,
  keep_alive: '10m',
  system_prompt:
    '/no_think\n你是动环监控平台告警诊断助手，请基于告警摘要输出诊断结论、处理建议和成因分析，不要输出无关前言。',
  parameters: {
    temperature: 0.1,
    top_p: 0.8,
    seed: 42,
    num_ctx: 8192,
  },
  options: {
    temperature: 0.1,
    top_p: 0.8,
    seed: 42,
    num_ctx: 8192,
    num_predict: 512,
  },
}

const SWIFT_PREVIEW_TRAIN_PRESET = {
  preview_only: true,
  train_type: 'lora',
  template: 'qwen3',
  num_train_epochs: 1,
  max_length: 4096,
  per_device_train_batch_size: 1,
  gradient_accumulation_steps: 8,
  lora_rank: 64,
  lora_alpha: 128,
  target_modules: 'all-linear',
  use_hf: true,
}

const SWIFT_PREVIEW_INFER_PRESET = {
  skip_ollama: true,
  skip_eval: true,
  skip_benchmark: true,
  planned_eval_only: true,
}

const form = reactive({
  name: '通用模型训练任务',
  scene: '告警诊断',
  base_model: 'Qwen/Qwen3.5-2B-Base',
  trainer_backend: 'llamafactory',
  route_type: 'sft',
  dataset_version: 'alarm_analysis_train_v1',
  evalset_version: 'alarm_analysis_eval_v1',
  prompt_template_version: 'alarm_analysis_prompt_v1',
})

function formatJson(value) {
  return JSON.stringify(value, null, 2)
}

const trainConfigText = ref(formatJson(LLAMA_FACTORY_TRAIN_PRESET))
const inferConfigText = ref(formatJson(LLAMA_FACTORY_INFER_PRESET))

watch(
  () => form.trainer_backend,
  (trainerBackend) => {
    if (trainerBackend === 'swift') {
      form.name = 'Qwen3.5-9B-Base ms-swift 预适配训练'
      form.base_model = 'Qwen/Qwen3.5-9B-Base'
      form.route_type = 'sft'
      form.dataset_version = 'alarm_analysis_swift_sft_v1'
      form.evalset_version = 'alarm_analysis_eval_v1'
      form.prompt_template_version = 'alarm_analysis_prompt_v1'
      trainConfigText.value = formatJson(SWIFT_PREVIEW_TRAIN_PRESET)
      inferConfigText.value = formatJson(SWIFT_PREVIEW_INFER_PRESET)
      return
    }

    if (form.name === 'Qwen3.5-9B-Base ms-swift 预适配训练') {
      form.name = '通用模型训练任务'
    }
    if (form.dataset_version === 'alarm_analysis_swift_sft_v1') {
      form.dataset_version = 'alarm_analysis_train_v1'
    }
    trainConfigText.value = formatJson(LLAMA_FACTORY_TRAIN_PRESET)
    inferConfigText.value = formatJson(LLAMA_FACTORY_INFER_PRESET)
  },
)

async function saveExperiment(runAfterSave) {
  submitting.value = true
  try {
    const trainConfig = JSON.parse(trainConfigText.value)
    const inferConfig = JSON.parse(inferConfigText.value)

    const experiment = await createExperiment({
      ...form,
      train_config: trainConfig,
      infer_config: inferConfig,
    })

    if (runAfterSave) {
      const run = await createRun(experiment.id)
      ElMessage.success(`训练和运行已创建：${run.id}`)
      router.push(`/runs/${run.id}`)
      return
    }

    ElMessage.success(`训练已创建：${experiment.id}`)
    router.push('/experiments')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.page-create-experiment {
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

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 0.9fr);
  gap: 24px;
}

.form-row {
  display: flex;
  gap: 16px;
}

.grow {
  flex: 1;
}

.config-stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.json-textarea :deep(textarea) {
  font-family: var(--font-mono);
  line-height: 1.65;
  background: #f8fafc;
}

@media (max-width: 1200px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .page-create-experiment {
    padding: 20px;
  }

  .page-header,
  .form-row {
    flex-direction: column;
  }
}
</style>
