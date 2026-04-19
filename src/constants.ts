import { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'gemini',
  providers: {
    gemini: {
      id: 'gemini',
      name: 'Gemini',
      apiKey: '',
      enabled: true,
      models: ['gemini-3-flash-preview', 'gemini-3-pro-preview']
    },
    claude: {
      id: 'claude',
      name: 'Claude',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      enabled: true,
      models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      enabled: true,
      models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo']
    },
    custom: {
      id: 'custom',
      name: '自定义 (OpenAPI)',
      apiKey: '',
      baseUrl: '',
      enabled: true,
      models: ['default']
    },
    vertex_ai: {
      id: 'vertex_ai',
      name: 'Vertex AI',
      apiKey: '',
      projectId: '',
      baseUrl: 'us-central1',
      enabled: true,
      models: ['gemini-1.5-pro', 'gemini-1.5-flash']
    }
  },
  collaboration: {
    enabled: true,
    agents: [
      {
        id: 'pm',
        name: '项目经理 (PM)',
        role: 'pm',
        provider: 'gemini',
        model: 'gemini-3-pro-preview',
        systemPrompt: '你是资深项目经理，负责分解任务、规划开发周期（规划、设计、开发、测试、部署）并监督项目进度。',
        enabled: true
      },
      {
        id: 'architect',
        name: '首席架构师',
        role: 'architect',
        provider: 'gemini',
        model: 'gemini-3-pro-preview',
        systemPrompt: '你是资深软件架构师，负责系统的整体设计和技术栈选型建议。',
        enabled: true
      },
      {
        id: 'developer',
        name: '全栈工程师',
        role: 'developer',
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        systemPrompt: '你是全栈开发专家，精通 TypeScript, React 和 Node.js，负责高质量的代码实施。',
        enabled: true
      },
      {
        id: 'reviewer',
        name: '代码审计员',
        role: 'reviewer',
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        systemPrompt: '你是代码审查专家，负责检查代码的质量、逻辑和潜在漏洞。',
        enabled: true
      }
    ]
  },
  git: {
    enabled: false,
    repoUrl: '',
    branch: 'main'
  },
  analysis: {
    provider: 'gemini',
    autoScan: true
  }
};
