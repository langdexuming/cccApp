import { GoogleGenAI } from "@google/genai";
import { Message, AppSettings } from "../types";
import {
  requestDesktopChatCompletion,
  requestDesktopTitle,
} from "../lib/desktop";

export async function* streamChat(
  messages: Message[], 
  settings: AppSettings,
  activeModel: string,
  effort?: 'low' | 'medium' | 'high',
) {
  if (!activeModel.trim()) {
    throw new Error('当前没有可用模型，请先在设置中补充模型列表。');
  }

  const desktopResponse = await requestDesktopChatCompletion({
    messages,
    settings,
    activeModel,
    effort,
  });
  if (desktopResponse !== null) {
    yield* yieldTextInChunks(desktopResponse);
    return;
  }

  if (settings.collaboration?.enabled) {
    const enabledAgents = settings.collaboration.agents.filter((agent) => agent.enabled);
    if (enabledAgents.length > 0) {
      for (const agent of enabledAgents) {
        yield `\n\n### ${agent.name} (${agent.role})\n\n`;

        const agentProvider = settings.providers[agent.provider];
        const agentApiKey =
          agent.provider === 'gemini' && !agentProvider.apiKey && typeof process !== 'undefined'
            ? process.env.GEMINI_API_KEY
            : agentProvider.apiKey;

        if (!agentApiKey) {
          yield `警告: 代理 ${agent.name} 所需的 ${agentProvider.name} API Key 未配置。\n\n`;
          continue;
        }

        const agentMessages: Message[] = [
          {
            id: 'sys',
            role: 'system',
            content: agent.systemPrompt,
            timestamp: Date.now(),
          },
          ...messages,
        ];

        try {
          switch (agent.provider) {
            case 'gemini':
              yield* streamGemini(agentMessages, agentApiKey, agent.model, agentProvider.baseUrl);
              break;
            case 'claude':
              yield* streamClaude(
                agentMessages,
                agentApiKey,
                agent.model,
                agentProvider.baseUrl,
                agentProvider.wireApi === 'cli' ? 'messages' : agentProvider.wireApi,
              );
              break;
            case 'openai':
            case 'custom':
              yield* streamOpenAICompatible(
                agentMessages,
                agentApiKey,
                agent.model,
                agentProvider.baseUrl,
                agentProvider.wireApi === 'responses' ? 'responses' : 'chat_completions',
              );
              break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          yield `警告: 代理 ${agent.name} 响应出错: ${message}\n\n`;
        }
      }
      return;
    }
  }

  const provider = settings.providers[settings.activeProvider];
  const apiKey =
    settings.activeProvider === 'gemini' && !provider.apiKey && typeof process !== 'undefined'
      ? process.env.GEMINI_API_KEY
      : provider.apiKey;

  if (!apiKey) {
    throw new Error(`请先在设置中配置 ${provider.name} 的 API Key`);
  }

  switch (settings.activeProvider) {
    case 'gemini':
      yield* streamGemini(messages, apiKey, activeModel, provider.baseUrl);
      break;
    case 'claude':
      yield* streamClaude(
        messages,
        apiKey,
        activeModel,
        provider.baseUrl,
        provider.wireApi === 'cli' ? 'messages' : provider.wireApi,
      );
      break;
    case 'openai':
    case 'custom':
      yield* streamOpenAICompatible(
        messages,
        apiKey,
        activeModel,
        provider.baseUrl,
        provider.wireApi === 'responses' ? 'responses' : 'chat_completions',
        effort,
      );
      break;
    default:
      throw new Error('未知的模型提供商');
  }
}

async function* yieldTextInChunks(text: string) {
  if (!text) {
    return;
  }
  const chunkSize = text.length > 600 ? 48 : 24;
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
    await new Promise((resolve) => window.setTimeout(resolve, 8));
  }
}

function createGeminiClient(apiKey: string, baseUrl?: string) {
  const trimmedBaseUrl = baseUrl?.trim();
  return new GoogleGenAI({
    apiKey,
    ...(trimmedBaseUrl ? {baseURL: trimmedBaseUrl} : {}),
  });
}

async function* streamGemini(messages: Message[], apiKey: string, model: string, baseUrl?: string) {
  const ai = createGeminiClient(apiKey, baseUrl);
  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');
  const history = chatMessages.slice(0, -1).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  const lastMessage = chatMessages[chatMessages.length - 1]?.content || "";

  try {
    const chat = ai.chats.create({
      model: model,
      config: {
        ...(systemMessage ? { systemInstruction: systemMessage.content } : {})
      },
      history: history as any,
    });

    const result = await chat.sendMessageStream({ message: lastMessage });

    for await (const chunk of result) {
      yield chunk.text || '';
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

function claudeApiRoot(baseUrl?: string) {
  const trimmed = (baseUrl || 'https://api.anthropic.com').trim().replace(/\/$/, '');
  if (trimmed.endsWith('/messages')) {
    return trimmed.slice(0, -'/messages'.length);
  }
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed.slice(0, -'/chat/completions'.length);
  }
  return trimmed;
}

function claudeMessagesUrl(baseUrl?: string) {
  const root = claudeApiRoot(baseUrl);
  return root.endsWith('/v1') ? `${root}/messages` : `${root}/v1/messages`;
}

function claudeChatCompletionsUrl(baseUrl?: string) {
  const root = claudeApiRoot(baseUrl);
  return root.endsWith('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
}

function claudeUses1mContext(model: string) {
  return model.trim().endsWith('[1m]');
}

function claudeApiModel(model: string) {
  return model.trim().replace(/\[(1|2)m\]/gi, '').trim();
}

function claudeSupportsInterleavedThinking(model: string) {
  const normalized = claudeApiModel(model).toLowerCase();
  return normalized.includes('claude-opus-4') || normalized.includes('claude-sonnet-4');
}

function claudeBetas(model: string) {
  const normalized = claudeApiModel(model).toLowerCase();
  const betas: string[] = [];
  if (!normalized.includes('haiku')) {
    betas.push('claude-code-20250219');
  }
  if (claudeUses1mContext(model)) {
    betas.push('context-1m-2025-08-07');
  }
  if (claudeSupportsInterleavedThinking(model)) {
    betas.push('interleaved-thinking-2025-05-14');
  }
  return betas;
}

function formatClaudeError(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return 'Claude API 请求失败';
  }
  return trimmed;
}

async function* streamClaude(
  messages: Message[],
  apiKey: string,
  model: string,
  baseUrl?: string,
  wireApi?: 'messages' | 'chat_completions' | 'responses',
) {
  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const apiModel = claudeApiModel(model);
  const betas = claudeBetas(model);
  if (wireApi === 'chat_completions') {
    yield* streamOpenAICompatible(
      messages,
      apiKey,
      apiModel,
      claudeApiRoot(baseUrl),
      'chat_completions',
    );
    return;
  }

  const url = claudeMessagesUrl(baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      ...(betas.length ? { 'anthropic-beta': betas.join(',') } : {}),
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: apiModel,
      system: [
        {
          type: 'text',
          text: 'x-anthropic-billing-header: cc_version=ccc_app; cc_entrypoint=desktop;',
        },
        {
          type: 'text',
          text: "You are Claude Code, Anthropic's official CLI for Claude.",
        },
        ...(systemMessage?.content ? [{type: 'text', text: systemMessage.content}] : []),
      ],
      messages: chatMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: 4096,
      stream: true,
      thinking: {
        type: 'disabled',
      },
      metadata: {
        user_id: JSON.stringify({
          device_id: 'desktop',
          account_uuid: '',
          session_id: 'desktop',
        }),
      },
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    try {
      const error = JSON.parse(raw);
      const message =
        error.error?.message ||
        error.error ||
        error.message ||
        raw;
      throw new Error(formatClaudeError(message || 'Claude API 请求失败'));
    } catch {
      throw new Error(formatClaudeError(raw || 'Claude API 请求失败'));
    }
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta') {
            yield data.delta.text;
          }
        } catch (e) {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }
}

async function* streamOpenAI(messages: Message[], apiKey: string, model: string, baseUrl?: string) {
  const url = `${baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API 请求失败');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') break;
        try {
          const data = JSON.parse(dataStr);
          const content = data.choices[0]?.delta?.content;
          if (content) yield content;
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
}

function openAIBaseUrl(baseUrl?: string) {
  return (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) {
    return '';
  }

  return payload.output
    .flatMap((item: any) => item?.content ?? [])
    .map((item: any) => {
      if (typeof item?.text === 'string') {
        return item.text;
      }
      if (typeof item?.output_text === 'string') {
        return item.output_text;
      }
      return '';
    })
    .join('');
}

function extractResponseTextFromSse(raw: string): string {
  let streamedText = '';
  let finalText = '';

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) {
      continue;
    }

    const data = trimmed.slice(6).trim();
    if (!data || data === '[DONE]') {
      continue;
    }

    try {
      const payload = JSON.parse(data);
      if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
        streamedText += payload.delta;
      }
      if (payload.type === 'response.output_text.done' && typeof payload.text === 'string') {
        finalText = payload.text;
      }
      if (payload.type === 'response.completed' && !finalText.trim()) {
        finalText = extractResponseText(payload.response);
      }
    } catch {
      // Ignore non-JSON event payloads.
    }
  }

  return finalText.trim() ? finalText : streamedText;
}

async function* streamResponsesApi(
  messages: Message[],
  apiKey: string,
  model: string,
  baseUrl?: string,
  effort?: 'low' | 'medium' | 'high',
) {
  const response = await fetch(`${openAIBaseUrl(baseUrl)}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(effort ? {reasoning: {effort}} : {}),
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    try {
      const error = JSON.parse(raw);
      throw new Error(error.error?.message || error.message || 'Responses API 请求失败');
    } catch {
      throw new Error(raw.trim() || 'Responses API 请求失败');
    }
  }

  const raw = await response.text();
  let text = '';
  try {
    text = extractResponseText(JSON.parse(raw));
  } catch {
    text = extractResponseTextFromSse(raw);
  }
  if (!text.trim()) {
    throw new Error('Responses API 返回了无法解析的内容');
  }

  yield* yieldTextInChunks(text);
}

async function* streamOpenAICompatible(
  messages: Message[],
  apiKey: string,
  model: string,
  baseUrl?: string,
  wireApi?: 'chat_completions' | 'responses',
  effort?: 'low' | 'medium' | 'high',
) {
  if (wireApi === 'responses') {
    yield* streamResponsesApi(messages, apiKey, model, baseUrl, effort);
    return;
  }
  yield* streamOpenAI(messages, apiKey, model, baseUrl);
}

export async function generateTitle(firstMessage: string, settings: AppSettings): Promise<string> {
  const desktopTitle = await requestDesktopTitle({firstMessage, settings});
  if (desktopTitle !== null) {
    return desktopTitle || "New Chat";
  }

  const provider = settings.providers[settings.activeProvider];
  if (!provider.apiKey) return "New Chat";

  try {
    if (settings.activeProvider === 'gemini') {
      const ai = createGeminiClient(provider.apiKey, provider.baseUrl);
      const response = await ai.models.generateContent({
        model: provider.models[0],
        contents: `Generate a very short, concise title (max 5 words) for a chat that starts with: "${firstMessage}". Return only the title text.`,
      });
      return response.text?.trim() || "New Chat";
    } else {
      // Fallback for others using OpenAI-like format
      // Simplified for title generation
      return "New Chat"; 
    }
  } catch (error) {
    return "New Chat";
  }
}
