import type {LocalToolConfigResponse} from '../../localToolConfig.types';
import type {
  AppSettings,
  Message,
  PersistedAppState,
  Chat,
  ProviderConfig,
  WorkspaceExternalConversation,
} from '../types';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

type ChatCompletionPayload = {
  messages: Message[];
  settings: AppSettings;
  activeModel: string;
  effort?: Chat['effort'];
  workspace?: string;
};

type TitlePayload = {
  firstMessage: string;
  settings: AppSettings;
};

type FetchProviderModelsPayload = {
  providerId: string;
  settings: AppSettings;
};

type FetchProviderModelsResponse = {
  models: string[];
};

type GitSyncPayload = {
  git: AppSettings['git'];
  operation: 'pull' | 'push';
};

type GitSyncResponse = {
  stdout: string;
  stderr: string;
};

type ProjectContextPayload = {
  rootPath?: string;
};

type ProjectContextResponse = {
  rootPath: string;
  outline: string;
};

type ProjectGeneratePayload = {
  rootPath?: string;
  providerId: string;
  provider: ProviderConfig;
  activeModel?: string;
  prompt: string;
};

type ProjectApplyFixPayload = {
  rootPath?: string;
  file: string;
  content: string;
};

type ProjectApplyFixResponse = {
  path: string;
};

type KairosLog = {
  timestamp: string;
  event: string;
  type: string;
};

type KairosLogsResponse = {
  logs: KairosLog[];
  lastPatrol: string;
};

type DesktopUpdateInfo = {
  available?: boolean;
  version?: string;
  body?: string;
  date?: string;
  downloadAndInstall?: (onProgress?: (progress: unknown) => void) => Promise<void>;
};

export async function normalizeWorkspacePath(path: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<string>('normalize_workspace_path', {path});
}

export async function pickWorkspacePath(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<string | null>('pick_workspace_path');
}

export async function openWorkspacePath(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invokeCommand('open_workspace_path', {path});
}

export async function fetchWorkspaceExternalConversations(
  workspace: string,
): Promise<WorkspaceExternalConversation[]> {
  if (!isTauriRuntime() || !workspace.trim()) {
    return [];
  }
  return invokeCommand<WorkspaceExternalConversation[]>('get_workspace_external_conversations', {
    workspace,
  });
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__ !== 'undefined';
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const {invoke} = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function loadPersistedState(): Promise<PersistedAppState | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<PersistedAppState | null>('load_app_state');
}

export async function savePersistedState(state: PersistedAppState): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invokeCommand('save_app_state', {state});
}

export async function readLocalToolConfig(): Promise<LocalToolConfigResponse | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<LocalToolConfigResponse>('read_local_tool_configs');
}

export async function requestDesktopChatCompletion(
  payload: ChatCompletionPayload,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<string>('chat_completion', {payload});
}

export async function requestDesktopTitle(
  payload: TitlePayload,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<string>('generate_chat_title', {payload});
}

export async function fetchRemoteProviderModels(
  payload: FetchProviderModelsPayload,
): Promise<FetchProviderModelsResponse | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<FetchProviderModelsResponse>('fetch_provider_models', {payload});
}

export async function requestGitSync(
  payload: GitSyncPayload,
): Promise<GitSyncResponse | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<GitSyncResponse>('git_sync', {payload});
}

export async function readProjectContext(
  payload: ProjectContextPayload,
): Promise<ProjectContextResponse | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<ProjectContextResponse>('read_project_context', {payload});
}

export async function generateProjectText(
  payload: ProjectGeneratePayload,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<string>('generate_project_text', {payload});
}

export async function applyProjectFixDesktop(
  payload: ProjectApplyFixPayload,
): Promise<ProjectApplyFixResponse | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<ProjectApplyFixResponse>('apply_project_fix', {payload});
}

export async function fetchKairosLogsDesktop(
  payload: ProjectContextPayload = {},
): Promise<KairosLogsResponse | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invokeCommand<KairosLogsResponse>('get_kairos_logs', {payload});
}

export async function checkDesktopUpdate(): Promise<DesktopUpdateInfo | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    const updaterSpecifier = '@tauri-apps/plugin-updater';
    const updaterModule = await import(/* @vite-ignore */ updaterSpecifier);
    const check = (updaterModule as {check?: () => Promise<DesktopUpdateInfo | null>}).check;
    if (!check) {
      return null;
    }
    const update = await check();
    return update;
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return null;
  }
}
