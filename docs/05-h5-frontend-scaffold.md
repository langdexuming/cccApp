# 第 5 步：H5 前端脚手架

当前已新增轻量 H5 前端骨架：

- `Vue 3`
- `Vite`
- `Vant 4`

## 目标

前端一期只做：

- 实验列表
- 新建实验
- 运行列表
- 运行详情
- 首页概览

不做：

- 复杂权限
- 多维筛选
- 图表大屏
- 在线日志流

## 关键路径

- [frontend/package.json](E:\ai\ai_trains\frontend\package.json)
- [frontend/src/router/index.js](E:\ai\ai_trains\frontend\src\router\index.js)
- [frontend/src/views/DashboardPage.vue](E:\ai\ai_trains\frontend\src\views\DashboardPage.vue)
- [frontend/src/views/ExperimentCreatePage.vue](E:\ai\ai_trains\frontend\src\views\ExperimentCreatePage.vue)
- [frontend/src/views/RunsPage.vue](E:\ai\ai_trains\frontend\src\views\RunsPage.vue)
- [frontend/src/views/RunDetailPage.vue](E:\ai\ai_trains\frontend\src\views\RunDetailPage.vue)

## 交互范围

当前已经对接的 API：

- `GET /api/health`
- `GET /api/experiments`
- `POST /api/experiments`
- `POST /api/experiments/{id}/runs`
- `GET /api/runs`
- `GET /api/runs/{id}`

## 下一步

后续可以继续补：

- 运行日志查看
- 评测与 benchmark 结果卡片
- 对比报告页面
