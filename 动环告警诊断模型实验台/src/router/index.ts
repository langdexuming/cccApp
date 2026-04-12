import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/components/layout/AppLayout.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'Overview',
          component: () => import('@/views/Overview.vue'),
        },
        {
          path: 'experiments',
          name: 'ExperimentList',
          component: () => import('@/views/experiments/ExperimentList.vue'),
        },
        {
          path: 'experiments/create',
          name: 'CreateExperiment',
          component: () => import('@/views/experiments/CreateExperiment.vue'),
        },
        {
          path: 'runs',
          name: 'RunList',
          component: () => import('@/views/runs/RunList.vue'),
        },
        {
          path: 'runs/compare',
          name: 'RunCompare',
          component: () => import('@/views/runs/RunCompare.vue'),
        },
        {
          path: 'runs/:id',
          name: 'RunDetail',
          component: () => import('@/views/runs/RunDetail.vue'),
        },
      ],
    },
  ],
});

export default router;
