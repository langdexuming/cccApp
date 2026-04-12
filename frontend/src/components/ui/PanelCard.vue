<template>
  <section class="panel-card" :class="{ 'no-padding': noPadding }">
    <header v-if="title || $slots.header" class="panel-header">
      <slot name="header">
        <div>
          <h3 class="panel-title">{{ title }}</h3>
          <p v-if="subtitle" class="panel-subtitle">{{ subtitle }}</p>
        </div>
        <div class="panel-extra">
          <slot name="extra"></slot>
        </div>
      </slot>
    </header>
    <div class="panel-body">
      <slot></slot>
    </div>
    <footer v-if="$slots.footer" class="panel-footer">
      <slot name="footer"></slot>
    </footer>
  </section>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  noPadding: {
    type: Boolean,
    default: false,
  },
})
</script>

<style scoped lang="scss">
.panel-card {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 20px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.panel-header {
  padding: 18px 22px;
  border-bottom: 1px solid var(--divider-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.panel-subtitle {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.panel-body {
  padding: 22px;
}

.panel-card.no-padding .panel-body {
  padding: 0;
}

.panel-footer {
  padding: 14px 22px;
  background: #f8fafc;
  border-top: 1px solid var(--divider-color);
}
</style>
