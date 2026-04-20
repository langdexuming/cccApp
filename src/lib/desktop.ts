import type {LocalToolConfigResponse} from '../../localToolConfig.types';
import type {
  AppSettings,
  Message,
  PersistedAppState,
  Chat,
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

export async function checkDesktopUpdate() {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    return update;
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return null;
  }
}
