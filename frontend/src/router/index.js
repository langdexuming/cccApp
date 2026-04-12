import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from '@/components/layout/AppLayout.vue'

const routes = [
  {
    path: '/',
    component: AppLayout,
    children: [
      {
        path: '',
        name: 'overview',
        component: () => import('@/views/Overview.vue'),
        meta: { title: '总览' },
      },
      {
        path: 'experiments',
        name: 'experiments',
        component: () => import('@/views/experiments/ExperimentList.vue'),
        meta: { title: '训练列表' },
      },
      {
        path: 'experiments/create',
        name: 'experiment-create',
        component: () => import('@/views/experiments/CreateExperiment.vue'),
        meta: { title: '新建训练' },
      },
      {
        path: 'runs',
        name: 'runs',
        component: () => import('@/views/runs/RunList.vue'),
        meta: { title: '运行列表' },
      },
      {
        path: 'runs/compare',
        name: 'run-compare',
        component: () => import('@/views/runs/RunCompare.vue'),
        meta: { title: '运行对比' },
      },
      {
        path: 'runs/:id',
        name: 'run-detail',
        component: () => import('@/views/runs/RunDetail.vue'),
        meta: { title: '运行详情' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
