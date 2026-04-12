<template>
  <header class="app-header">
    <div class="header-left">
      <div class="breadcrumb">
        <span class="breadcrumb-item">Workbench</span>
        <ChevronRight :size="14" class="separator" />
        <span class="breadcrumb-item active">{{ pageTitle }}</span>
      </div>
    </div>
    
    <div class="header-right">
      <div class="system-status">
        <div class="status-dot online"></div>
        <span class="status-text">System Online</span>
      </div>
      
      <div class="divider"></div>
      
      <div class="env-tag">PROD-ENV</div>
      
      <div class="divider"></div>
      
      <div class="user-info">
        <div class="avatar">L</div>
        <span class="username">langdexuming</span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronRight } from 'lucide-vue-next';

const route = useRoute();
const pageTitle = computed(() => route.name?.toString() || 'Dashboard');
</script>

<style lang="scss" scoped>
.app-header {
  height: 64px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  z-index: 10;
}

.header-left {
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    
    .breadcrumb-item {
      color: var(--text-secondary);
      
      &.active {
        color: var(--text-primary);
        font-weight: 500;
      }
    }
    
    .separator {
      color: var(--text-muted);
    }
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    
    &.online {
      background: var(--state-completed);
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
    }
  }
  
  .status-text {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
  }
}

.divider {
  width: 1px;
  height: 20px;
  background: var(--divider-color);
}

.env-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  background: #fef2f2;
  color: #ef4444;
  border: 1px solid #fee2e2;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  
  .avatar {
    width: 28px;
    height: 28px;
    background: var(--color-primary);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  }
  
  .username {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }
}
</style>
