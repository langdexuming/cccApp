<template>
  <div class="app-layout">
    <AppSidebar />
    <div class="main-container">
      <AppHeader />
      <main class="content-area">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
</script>

<style scoped lang="scss">
.app-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
}

.main-container {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
