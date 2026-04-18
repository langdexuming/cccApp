import type {AppSettings, ProviderConfig, ProviderType} from '../types';

const DEFAULT_COLLABORATION: AppSettings['collaboration'] = {
  enabled: false,
  agents: [
    {
      id: 'reviewer',
      name: 'Code Reviewer',
      role: 'reviewer',
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
      systemPrompt: 'Review code quality, logic, and potential issues.',
      enabled: true,
    },
    {
      id: 'architect',
      name: 'Architect',
      role: 'architect',
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
      systemPrompt: 'Provide architecture and technical design guidance.',
      enabled: true,
    },
  ],
};

const DEFAULT_GIT: AppSettings['git'] = {
  enabled: false,
  repoUrl: '',
  branch: 'main',
};

export const BUILTIN_PROVIDER_MODELS: Record<ProviderType, string[]> = {
  gemini: [
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  claude: [],
  openai: [
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo-preview',
    'gpt-4',
    'gpt-3.5-turbo',
  ],
  custom: [
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'deepseek-chat',
    'deepseek-reasoner',
    'qwen-max',
    'qwen-plus',
    'glm-4.5',
    'claude-3-7-sonnet-latest',
  ],
};

type ProviderSeed = Omit<ProviderConfig, 'models'> & {models?: string[]};

const PROVIDER_SEEDS: Record<ProviderType, ProviderSeed> = {
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com',
    enabled: true,
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    enabled: true,
    wireApi: 'messages',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    wireApi: 'chat_completions',
  },
  custom: {
    id: 'custom',
    name: '自定义 (OpenAI Compatible)',
    apiKey: '',
    baseUrl: '',
    enabled: true,
    wireApi: 'chat_completions',
  },
};

function inferWireApi(
  providerId: ProviderType,
  baseUrl: string | undefined,
  wireApi: ProviderConfig['wireApi'] | undefined,
): ProviderConfig['wireApi'] | undefined {
  const normalizedBaseUrl = baseUrl?.trim().toLowerCase() ?? '';
  if (providerId === 'claude') {
    if (wireApi === 'messages' || wireApi === 'chat_completions') {
      return wireApi;
    }
    if (normalizedBaseUrl.includes('/chat/completions')) {
      return 'chat_completions';
    }
    return 'messages';
  }
  if (
    (providerId === 'openai' || providerId === 'custom') &&
    normalizedBaseUrl.includes('/codex/')
  ) {
    return 'responses';
  }
  return wireApi;
}

function normalizeProviderModel(
  providerId: ProviderType,
  model: string | undefined,
): string | undefined {
  const value = model?.trim();
  if (!value) {
    return undefined;
  }

  if (providerId === 'claude' && !value.toLowerCase().startsWith('claude-')) {
    return undefined;
  }

  return value;
}

function uniqueModels(providerId: ProviderType, models: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of models) {
    const value = normalizeProviderModel(providerId, item);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }

  return next;
}

export function buildDefaultProviderConfig(id: ProviderType): ProviderConfig {
  const seed = PROVIDER_SEEDS[id];
  return {
    ...seed,
    models: [...BUILTIN_PROVIDER_MODELS[id]],
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    activeProvider: 'gemini',
    providers: {
      gemini: buildDefaultProviderConfig('gemini'),
      claude: buildDefaultProviderConfig('claude'),
      openai: buildDefaultProviderConfig('openai'),
      custom: buildDefaultProviderConfig('custom'),
    },
    collaboration: {
      enabled: DEFAULT_COLLABORATION.enabled,
      agents: DEFAULT_COLLABORATION.agents.map((agent) => ({...agent})),
    },
    git: {...DEFAULT_GIT},
  };
}

export function normalizeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  const defaults = createDefaultSettings();
  const activeProvider =
    raw?.activeProvider && raw.activeProvider in defaults.providers
      ? raw.activeProvider
      : defaults.activeProvider;

  const providers = (Object.keys(defaults.providers) as ProviderType[]).reduce(
    (acc, providerId) => {
      const base = defaults.providers[providerId];
      const incoming = raw?.providers?.[providerId];
      const hasIncomingModels =
        !!incoming && Object.prototype.hasOwnProperty.call(incoming, 'models');
      const normalizedIncomingModels = uniqueModels(providerId, incoming?.models ?? []);
      acc[providerId] = {
        ...base,
        ...incoming,
        models: hasIncomingModels ? normalizedIncomingModels : [...base.models],
        wireApi: inferWireApi(
          providerId,
          incoming?.baseUrl ?? base.baseUrl,
          incoming?.wireApi ?? base.wireApi,
        ),
      };
      return acc;
    },
    {} as AppSettings['providers'],
  );

  return {
    activeProvider,
    providers,
    collaboration: raw?.collaboration
      ? {
          enabled: !!raw.collaboration.enabled,
          agents:
            raw.collaboration.agents?.map((agent) => ({...agent})) ??
            DEFAULT_COLLABORATION.agents.map((agent) => ({...agent})),
        }
      : {
          enabled: DEFAULT_COLLABORATION.enabled,
          agents: DEFAULT_COLLABORATION.agents.map((agent) => ({...agent})),
        },
    git: {
      ...DEFAULT_GIT,
      ...(raw?.git ?? {}),
    },
  };
}
