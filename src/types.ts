export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
}

export type ProviderType = 'gemini' | 'claude' | 'openai' | 'custom' | 'vertex_ai';

export interface ProviderConfig {
  id: ProviderType;
  name: string;
  apiKey: string;
  authToken?: string;
  projectId?: string;
  baseUrl?: string;
  enabled: boolean;
  models: string[];
  wireApi?: 'messages' | 'chat_completions' | 'responses' | 'cli';
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
  analysis: {
    provider: AnalysisProvider;
    autoScan: boolean;
  };
}

export interface PersistedAppState {
  chats: Chat[];
  settings: AppSettings;
  activeChatId: string | null;
  pendingWorkspace?: string;
  sidebarCollapsedSections?: Record<string, boolean>;
  pinnedWorkspaces?: string[];
}

export type ProjectPhase = 'planning' | 'design' | 'development' | 'testing' | 'deployment' | 'maintenance';

export type AnalysisProvider = 'gemini' | 'openai' | 'vertex-ai';

export interface ProjectInsight {
  id: string;
  category: 'architecture' | 'performance' | 'security' | 'trends';
  title: string;
  description: string;
  suggestion: string;
  priority: 'low' | 'medium' | 'high';
  hasFix?: boolean;
}

export interface AnalysisResult {
  insights: ProjectInsight[];
  radar: {
    performance: number;
    security: number;
    maintainability: number;
    innovation: number;
    robustness: number;
  };
  context: {
    tree: any[];
    summary: string;
    dependencies?: Record<string, string[]>;
  };
}

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'completed' | 'blocked';
  assigneeId: string; // references AgentConfig.id
  phase: ProjectPhase;
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
  currentPhase?: ProjectPhase;
  tasks?: Task[];
}

export type WorkspaceExternalConversationSourceKind =
  | 'claude_cli'
  | 'codex_cli'
  | 'codex_app';

export interface WorkspaceExternalConversationMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
}

export interface WorkspaceExternalConversation {
  id: string;
  workspace: string;
  sourceKind: WorkspaceExternalConversationSourceKind;
  sourceLabel: string;
  title: string;
  updatedAt: number;
  preview: string;
  messages: WorkspaceExternalConversationMessage[];
  sourceDetail?: string | null;
  sessionId?: string | null;
  transcriptPath?: string | null;
}
