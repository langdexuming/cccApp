<template>
  <header class="app-header">
    <div class="header-left">
      <div class="breadcrumb">
        <span class="breadcrumb-item">模型训练工作台</span>
        <ChevronRight :size="14" class="breadcrumb-separator" />
        <span class="breadcrumb-item active">{{ pageTitle }}</span>
      </div>
    </div>

    <div class="header-right">
      <div class="system-status" :class="healthStatusClass">
        <div class="status-dot"></div>
        <span class="status-text">{{ healthStatusText }}</span>
      </div>

      <div class="header-divider"></div>

      <div class="env-tag">{{ healthEnv }}</div>

      <div class="header-divider"></div>

      <button class="refresh-button" type="button" @click="loadHealth">
        <RefreshCcw :size="16" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight, RefreshCcw } from 'lucide-vue-next'

import { fetchHealth } from '@/api/client'
import { formatEnvLabel } from '@/utils/display'

const route = useRoute()
const health = ref(null)

const pageTitle = computed(() => route.meta?.title || route.name || '总览')
const healthStatusClass = computed(() => (health.value?.status === 'ok' ? 'is-online' : 'is-offline'))
const healthStatusText = computed(() => (health.value?.status === 'ok' ? '系统正常' : '接口不可用'))
const healthEnv = computed(() => formatEnvLabel(health.value?.env || 'unknown'))

async function loadHealth() {
  try {
    health.value = await fetchHealth()
  } catch (error) {
    health.value = null
  }
}

onMounted(loadHealth)
</script>

<style scoped lang="scss">
.app-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--header-bg);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  position: sticky;
  top: 0;
  z-index: 20;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.breadcrumb-item {
  color: var(--text-secondary);

  &.active {
    color: var(--text-primary);
    font-weight: 700;
  }
}

.breadcrumb-separator {
  color: var(--text-muted);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 18px;
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  &.is-online .status-dot {
    background: var(--state-completed);
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.34);
  }

  &.is-offline .status-dot {
    background: var(--state-failed);
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.26);
  }
}

.env-tag {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  background: #eff6ff;
  color: #1d4ed8;
}

.header-divider {
  width: 1px;
  height: 18px;
  background: var(--divider-color);
}

.refresh-button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  background: #ffffff;
  color: var(--text-primary);
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
}
</style>
