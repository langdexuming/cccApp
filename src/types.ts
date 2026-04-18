export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
}

export type ProviderType = 'gemini' | 'claude' | 'openai' | 'custom';

export interface ProviderConfig {
  id: ProviderType;
  name: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  models: string[];
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  provider: ProviderType;
  model: string;
  systemPrompt: string;
  enabled: boolean;
}

export interface GitSettings {
  enabled: boolean;
  repoUrl: string;
  branch: string;
  lastSync?: number;
}

export interface AppSettings {
  providers: Record<ProviderType, ProviderConfig>;
  activeProvider: ProviderType;
  collaboration: {
    enabled: boolean;
    agents: AgentConfig[];
  };
  git: GitSettings;
}

export interface PersistedAppState {
  chats: Chat[];
  settings: AppSettings;
  activeChatId: string | null;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  model?: string;
  provider?: ProviderType;
  effort?: 'low' | 'medium' | 'high';
  workspace?: string;
}
