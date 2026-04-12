<template>
  <div class="app-sidebar">
    <div class="sidebar-logo">
      <div class="logo-icon">
        <Activity :size="20" />
      </div>
      <span class="logo-text">Alarm Model Lab</span>
    </div>

    <nav class="sidebar-nav">
      <router-link to="/" class="nav-item" active-class="active">
        <LayoutDashboard :size="18" />
        <span>Overview</span>
      </router-link>

      <div class="nav-group">
        <div class="group-label">Experiments</div>
        <router-link to="/experiments" class="nav-item" active-class="active">
          <FlaskConical :size="18" />
          <span>Experiment List</span>
        </router-link>
        <router-link to="/experiments/create" class="nav-item" active-class="active">
          <PlusCircle :size="18" />
          <span>Create Experiment</span>
        </router-link>
      </div>

      <div class="nav-group">
        <div class="group-label">Runs</div>
        <router-link to="/runs" class="nav-item" active-class="active">
          <Play :size="18" />
          <span>Run List</span>
        </router-link>
        <router-link to="/runs/compare" class="nav-item" active-class="active">
          <GitCompareArrows :size="18" />
          <span>Run Compare</span>
        </router-link>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="version">v1.1.0-gemini</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Activity,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  Play,
  PlusCircle,
} from 'lucide-vue-next';
</script>

<style lang="scss" scoped>
.app-sidebar {
  width: 240px;
  height: 100%;
  background: var(--sidebar-bg);
  color: var(--text-on-dark);
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.sidebar-logo {
  height: 64px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);

  .logo-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 10px 18px rgba(37, 99, 235, 0.22);
  }

  .logo-text {
    font-weight: 600;
    font-size: 16px;
    letter-spacing: 0.02em;
  }
}

.sidebar-nav {
  flex: 1;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-group {
  margin-top: 24px;

  .group-label {
    padding: 0 12px 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 600;
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: rgba(255, 255, 255, 0.72);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
  }

  &.active {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-weight: 500;
  }
}

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);

  .version {
    font-size: 11px;
    font-family: var(--font-mono);
    color: rgba(255, 255, 255, 0.3);
  }
}
</style>
