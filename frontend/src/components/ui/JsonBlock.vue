<template>
  <section class="json-block">
    <div class="json-header">
      <span class="json-label">{{ label }}</span>
      <button class="copy-button" type="button" @click="copyText">
        <Copy :size="14" />
      </button>
    </div>
    <pre class="json-code"><code>{{ formattedJson }}</code></pre>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Copy } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'

const props = defineProps({
  data: {
    type: [Object, Array, String, Number, Boolean, null],
    default: () => ({}),
  },
  label: {
    type: String,
    default: '数据快照',
  },
})

const formattedJson = computed(() => {
  if (typeof props.data === 'string') {
    try {
      return JSON.stringify(JSON.parse(props.data), null, 2)
    } catch (error) {
      return props.data
    }
  }
  return JSON.stringify(props.data, null, 2)
})

async function copyText() {
  await navigator.clipboard.writeText(formattedJson.value)
  ElMessage.success('已复制到剪贴板。')
}
</script>

<style scoped lang="scss">
.json-block {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #334155;
  background: #111827;
}

.json-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #0f172a;
  border-bottom: 1px solid #334155;
}

.json-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.copy-button {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #94a3b8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }
}

.json-code {
  margin: 0;
  padding: 16px;
  max-height: 360px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.7;
  color: #e2e8f0;
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
