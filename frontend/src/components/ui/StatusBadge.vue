<template>
  <div class="status-badge" :class="statusClass">
    <span class="dot"></span>
    <span>{{ displayLabel }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatStatusText } from '@/utils/display'

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    default: '',
  },
})

const statusClass = computed(() => {
  const value = String(props.status || '').toLowerCase()
  if (['completed', 'success', 'done'].includes(value)) return 'completed'
  if (['running', 'active', 'online'].includes(value)) return 'running'
  if (['failed', 'error', 'critical'].includes(value)) return 'failed'
  return 'pending'
})

const displayLabel = computed(() => props.label || formatStatusText(props.status))
</script>

<style scoped lang="scss">
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
  text-transform: capitalize;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.pending {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #475569;

  .dot {
    background: var(--state-pending);
  }
}

.running {
  background: #fffbeb;
  border-color: #fde68a;
  color: #b45309;

  .dot {
    background: var(--state-running);
  }
}

.completed {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;

  .dot {
    background: var(--state-completed);
  }
}

.failed {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;

  .dot {
    background: var(--state-failed);
  }
}
</style>
