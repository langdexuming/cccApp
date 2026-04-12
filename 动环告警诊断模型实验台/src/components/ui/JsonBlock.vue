<template>
  <div class="json-block">
    <div class="block-header">
      <span class="label">{{ label || 'Configuration' }}</span>
      <button class="copy-btn" @click="copyToClipboard">
        <Copy :size="14" />
      </button>
    </div>
    <pre class="code-content"><code>{{ formattedJson }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Copy } from 'lucide-vue-next';

const props = defineProps<{
  data: any;
  label?: string;
}>();

const formattedJson = computed(() => {
  if (typeof props.data === 'string') {
    try {
      return JSON.stringify(JSON.parse(props.data), null, 2);
    } catch {
      return props.data;
    }
  }
  return JSON.stringify(props.data, null, 2);
});

const copyToClipboard = () => {
  navigator.clipboard.writeText(formattedJson.value);
};
</script>

<style lang="scss" scoped>
.json-block {
  background: #1e293b;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid #334155;
  
  .block-header {
    background: #0f172a;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #334155;
    
    .label {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .copy-btn {
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      
      &:hover {
        background: rgba(255, 255, 255, 0.05);
        color: white;
      }
    }
  }
  
  .code-content {
    margin: 0;
    padding: 16px;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    color: #e2e8f0;
    max-height: 400px;
    overflow: auto;
    
    code {
      white-space: pre-wrap;
      word-break: break-all;
    }
  }
}
</style>
