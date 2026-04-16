import { GoogleGenAI } from "@google/genai";
import { Message, AppSettings, ProviderType } from "../types";
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

  const provider = settings.providers[settings.activeProvider];
  
  if (!provider.apiKey) {
    throw new Error(`请先在设置中配置 ${provider.name} 的 API Key`);
  }

  switch (settings.activeProvider) {
    case 'gemini':
      yield* streamGemini(messages, provider.apiKey, activeModel, provider.baseUrl);
      break;
    case 'claude':
      yield* streamClaude(messages, provider.apiKey, activeModel, provider.baseUrl);
      break;
    case 'openai':
    case 'custom':
      yield* streamOpenAI(messages, provider.apiKey, activeModel, provider.baseUrl);
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
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  const lastMessage = messages[messages.length - 1].content;

  try {
    const chat = ai.chats.create({
      model: model,
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

async function* streamClaude(messages: Message[], apiKey: string, model: string, baseUrl?: string) {
  const url = baseUrl || 'https://api.anthropic.com/v1/messages';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
      stream: true
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Claude API 请求失败');
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
      const url = `${provider.baseUrl || (settings.activeProvider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1')}/chat/completions`;
      // Simplified for title generation
      return "New Chat"; 
    }
  } catch (error) {
    return "New Chat";
  }
}
