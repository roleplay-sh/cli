import type { Scenario } from '../../schemas/scenario.schema.js';
import type { Transcript } from '../../schemas/transcript.schema.js';
import { OpenAiProvider } from './openai-provider.js';
import { MockLlmProvider } from './mock-provider.js';

export interface LlmGenerateInput {
  scenario: Scenario;
  transcript: Transcript;
  turn: number;
  model?: string;
  temperature?: number;
  purpose: 'roleplayed-user';
}

export interface LlmGenerateOutput {
  content: string;
  raw?: unknown;
}

export interface LlmProvider {
  generate(input: LlmGenerateInput): Promise<LlmGenerateOutput>;
}

export function createLlmProvider(provider: 'openai' | 'mock', model?: string): LlmProvider {
  if (provider === 'openai') return new OpenAiProvider(model);
  return new MockLlmProvider();
}
