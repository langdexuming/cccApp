import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import './styles/main.scss'

function formatError(error) {
  if (!error) {
    return '未知启动错误。'
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n\n${error.stack || ''}`.trim()
  }
  return String(error)
}

function showStartupError(error) {
  const root = document.querySelector('#app') || document.body
  const message = formatError(error)

  root.innerHTML = `
    <section style="min-height:100vh;padding:32px;background:#0f172a;color:#e2e8f0;font-family:Consolas,monospace;">
      <h1 style="margin:0 0 16px;font-size:24px;">前端启动异常</h1>
      <pre style="white-space:pre-wrap;line-height:1.7;padding:20px;border-radius:16px;background:#111827;border:1px solid #334155;">${message.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]))}</pre>
    </section>
  `

  console.error(error)
}

window.addEventListener('error', (event) => {
  showStartupError(event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  showStartupError(event.reason)
})

async function bootstrap() {
  const [{ default: App }, { default: router }] = await Promise.all([
    import('./App.vue'),
    import('./router'),
  ])

  const app = createApp(App)
  app.config.errorHandler = (error) => {
    showStartupError(error)
  }

  app.use(router)
  app.use(ElementPlus)
  app.mount('#app')
}

bootstrap().catch(showStartupError)
