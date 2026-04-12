<template>
  <div class="panel-card" :class="{ 'no-padding': noPadding }">
    <div v-if="title || $slots.header" class="panel-header">
      <slot name="header">
        <div class="header-content">
          <h3 class="panel-title">{{ title }}</h3>
          <p v-if="subtitle" class="panel-subtitle">{{ subtitle }}</p>
        </div>
        <div class="header-extra">
          <slot name="extra"></slot>
        </div>
      </slot>
    </div>
    <div class="panel-body">
      <slot></slot>
    </div>
    <div v-if="$slots.footer" class="panel-footer">
      <slot name="footer"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  subtitle?: string;
  noPadding?: boolean;
}>();
</script>

<style lang="scss" scoped>
.panel-card {
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  
  .panel-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--divider-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    
    .panel-title {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .panel-subtitle {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--text-muted);
    }
  }
  
  .panel-body {
    flex: 1;
    padding: 20px;
  }
  
  &.no-padding .panel-body {
    padding: 0;
  }
  
  .panel-footer {
    padding: 12px 20px;
    background: #f8fafc;
    border-top: 1px solid var(--divider-color);
    border-bottom-left-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
  }
}
</style>
