/**
 * 本机工具目录（.gemini / .claude / .codex）导入接口的响应类型
 * @author make java
 * @since 2026-04-16
 */
export type LocalToolConfigSource = {
  path: string;
  keys: string[];
};

export type LocalToolProviderPatch = {
  apiKey?: string;
  authToken?: string;
  baseUrl?: string;
  models?: string[];
  wireApi?: 'messages' | 'chat_completions' | 'responses' | 'cli' | 'claude_bridge';
};

export type LocalToolConfigResponse = {
  ok: boolean;
  homeDir?: string;
  error?: string;
  providers: Partial<Record<'gemini' | 'claude' | 'openai', LocalToolProviderPatch>>;
  sources: LocalToolConfigSource[];
};
