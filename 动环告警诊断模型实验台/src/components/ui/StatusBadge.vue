<template>
  <div class="status-badge" :class="statusClass">
    <div class="dot"></div>
    <span class="label">{{ label || status }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: string;
  label?: string;
}>();

const statusClass = computed(() => {
  const s = props.status.toLowerCase();
  if (['running', 'active', 'online'].includes(s)) return 'running';
  if (['completed', 'success', 'done'].includes(s)) return 'completed';
  if (['failed', 'error', 'critical'].includes(s)) return 'failed';
  if (['pending', 'queued', 'draft'].includes(s)) return 'pending';
  return '';
});
</script>

<style lang="scss" scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
  border: 1px solid transparent;
  
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  
  &.running {
    background: #fffbeb;
    color: #b45309;
    border-color: #fef3c7;
    .dot { background: var(--state-running); }
  }
  
  &.completed {
    background: #ecfdf5;
    color: #047857;
    border-color: #d1fae5;
    .dot { background: var(--state-completed); }
  }
  
  &.failed {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fee2e2;
    .dot { background: var(--state-failed); }
  }
  
  &.pending {
    background: #f8fafc;
    color: #475569;
    border-color: #e2e8f0;
    .dot { background: var(--state-pending); }
  }
}
</style>
