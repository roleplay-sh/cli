import { AppError } from '../../core/errors.js';

export type LlmProviderName = 'mock' | 'openai' | 'anthropic' | 'google' | 'openai-compatible';

export interface LlmProviderOptions {
  provider: LlmProviderName;
  model?: string;
  baseUrl?: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerateOptions extends LlmProviderOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmGenerateResult {
  content: string;
  raw?: unknown;
}

const defaultModels: Record<Exclude<LlmProviderName, 'mock'>, string> = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-3-5-haiku-latest',
  google: 'gemini-1.5-flash',
  'openai-compatible': 'gpt-4.1-mini',
};

export function normalizeProvider(value: string | undefined, fallback: LlmProviderName = 'mock'): LlmProviderName {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'mock' ||
    normalized === 'openai' ||
    normalized === 'anthropic' ||
    normalized === 'google' ||
    normalized === 'openai-compatible'
  ) {
    return normalized;
  }
  throw new AppError({
    code: 'LLM_PROVIDER_UNSUPPORTED',
    message: `Unsupported LLM provider "${value}".`,
    suggestion: 'Use mock, openai, anthropic, google, or openai-compatible.',
    exitCode: 2,
  });
}

export function resolveProviderOptions(input: {
  provider: LlmProviderName;
  model?: string;
  baseUrl?: string;
}): LlmProviderOptions {
  if (input.provider === 'mock') return { provider: 'mock' };
  return {
    provider: input.provider,
    model: input.model ?? process.env[modelEnvName(input.provider)] ?? defaultModels[input.provider],
    baseUrl: input.baseUrl ?? process.env.ROLEPLAY_LLM_BASE_URL,
  };
}

export async function generateLlm(input: LlmGenerateOptions): Promise<LlmGenerateResult> {
  if (input.provider === 'mock') {
    throw new AppError({
      code: 'LLM_PROVIDER_REQUIRED',
      message: 'Mock provider cannot generate LLM output.',
      suggestion: 'Choose openai, anthropic, google, or openai-compatible.',
      exitCode: 2,
    });
  }

  if (input.provider === 'openai' || input.provider === 'openai-compatible') return generateOpenAi(input);
  if (input.provider === 'anthropic') return generateAnthropic(input);
  return generateGoogle(input);
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (fenced) return JSON.parse(fenced);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new AppError({
      code: 'LLM_INVALID_JSON',
      message: 'The LLM provider did not return valid JSON.',
      suggestion: 'Retry the run or choose a more capable model.',
      exitCode: 4,
    });
  }
}

function modelEnvName(provider: Exclude<LlmProviderName, 'mock'>) {
  if (provider === 'openai') return 'ROLEPLAY_OPENAI_MODEL';
  if (provider === 'anthropic') return 'ROLEPLAY_ANTHROPIC_MODEL';
  if (provider === 'google') return 'ROLEPLAY_GOOGLE_MODEL';
  return 'ROLEPLAY_LLM_MODEL';
}

function apiKeyFor(provider: Exclude<LlmProviderName, 'mock'>): string | undefined {
  const envName =
    provider === 'openai'
      ? 'ROLEPLAY_OPENAI_API_KEY'
      : provider === 'anthropic'
        ? 'ROLEPLAY_ANTHROPIC_API_KEY'
        : provider === 'google'
          ? 'ROLEPLAY_GOOGLE_API_KEY'
          : 'ROLEPLAY_LLM_API_KEY';
  const value = process.env[envName];
  if (provider === 'openai-compatible') return value;
  if (!value) {
    throw new AppError({
      code: 'LLM_API_KEY_MISSING',
      message: `Missing ${envName}.`,
      suggestion: `Set ${envName} or choose --provider mock for a local smoke test.`,
      exitCode: 2,
    });
  }
  return value;
}

async function generateOpenAi(input: LlmGenerateOptions): Promise<LlmGenerateResult> {
  const provider = input.provider as 'openai' | 'openai-compatible';
  const baseUrl =
    provider === 'openai'
      ? 'https://api.openai.com/v1'
      : input.baseUrl ?? process.env.ROLEPLAY_LLM_BASE_URL ?? 'http://localhost:11434/v1';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const apiKey = apiKeyFor(provider);
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: input.model ?? defaultModels[provider],
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 900,
      response_format: { type: 'json_object' },
    }),
  });
  const raw = await parseProviderResponse(response);
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw invalidProviderResponse('OpenAI-compatible', raw);
  return { content, raw };
}

async function generateAnthropic(input: LlmGenerateOptions): Promise<LlmGenerateResult> {
  const system = input.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const messages = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }));
  const apiKey = apiKeyFor('anthropic') as string;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model ?? defaultModels.anthropic,
      system,
      messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 900,
    }),
  });
  const raw = await parseProviderResponse(response);
  const content = raw?.content?.find?.((item: any) => item?.type === 'text')?.text;
  if (typeof content !== 'string' || !content.trim()) throw invalidProviderResponse('Anthropic', raw);
  return { content, raw };
}

async function generateGoogle(input: LlmGenerateOptions): Promise<LlmGenerateResult> {
  const model = input.model ?? defaultModels.google;
  const apiKey = apiKeyFor('google') as string;
  const prompt = input.messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.2,
          maxOutputTokens: input.maxTokens ?? 900,
          responseMimeType: 'application/json',
        },
      }),
    },
  );
  const raw = await parseProviderResponse(response);
  const content = raw?.candidates?.[0]?.content?.parts?.map?.((part: any) => part?.text).filter(Boolean).join('\n');
  if (typeof content !== 'string' || !content.trim()) throw invalidProviderResponse('Google', raw);
  return { content, raw };
}

async function parseProviderResponse(response: Response): Promise<any> {
  const text = await response.text();
  const raw = text ? tryParseJson(text) : undefined;
  if (!response.ok) {
    throw new AppError({
      code: 'LLM_PROVIDER_ERROR',
      message: `LLM provider returned ${response.status}: ${providerErrorMessage(raw) ?? response.statusText}`,
      suggestion: 'Check the provider API key, model name, quota, and network access.',
      exitCode: 4,
      cause: raw ?? text,
    });
  }
  return raw;
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function providerErrorMessage(raw: any): string | undefined {
  return raw?.error?.message ?? raw?.message ?? raw?.error;
}

function invalidProviderResponse(provider: string, raw: unknown): AppError {
  return new AppError({
    code: 'LLM_INVALID_RESPONSE',
    message: `${provider} did not return text content.`,
    suggestion: 'Retry the run or choose another model/provider.',
    exitCode: 4,
    cause: raw,
  });
}
