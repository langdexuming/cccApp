<template>
  <aside class="app-sidebar">
    <div class="sidebar-logo">
      <div class="logo-icon">
        <Activity :size="20" />
      </div>
      <span class="logo-text">模型训练工作台</span>
    </div>

    <nav class="sidebar-nav">
      <router-link to="/" class="nav-item" active-class="active">
        <LayoutDashboard :size="18" />
        <span>总览</span>
      </router-link>

      <div class="nav-group">
        <div class="group-label">训练</div>
        <router-link to="/experiments" class="nav-item" active-class="active">
          <FlaskConical :size="18" />
          <span>训练列表</span>
        </router-link>
        <router-link to="/experiments/create" class="nav-item" active-class="active">
          <PlusCircle :size="18" />
          <span>新建训练</span>
        </router-link>
      </div>

      <div class="nav-group">
        <div class="group-label">运行</div>
        <router-link to="/runs" class="nav-item" active-class="active">
          <Play :size="18" />
          <span>运行列表</span>
        </router-link>
        <router-link to="/runs/compare" class="nav-item" active-class="active">
          <GitCompareArrows :size="18" />
          <span>运行对比</span>
        </router-link>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="version">前端 v2.0</div>
    </div>
  </aside>
</template>

<script setup>
import {
  Activity,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  Play,
  PlusCircle,
} from 'lucide-vue-next'
</script>

<style scoped lang="scss">
.app-sidebar {
  width: 248px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.14), transparent 18%),
    linear-gradient(180deg, #111827 0%, #0f172a 100%);
  color: var(--text-on-dark);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.sidebar-logo {
  height: 70px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.logo-icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.26);
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.sidebar-nav {
  flex: 1;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-group {
  margin-top: 22px;
}

.group-label {
  padding: 0 12px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.74);
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #ffffff;
  }

  &.active {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    font-weight: 700;
  }
}

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.version {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.32);
  font-family: var(--font-mono);
}
</style>
