import type { Scenario } from '../../schemas/scenario.schema.js';
import type { Transcript } from '../../schemas/transcript.schema.js';
import type { Report } from '../../schemas/report.schema.js';
import { resolveProviderOptions, type LlmProviderName } from '../llm/client.js';
import { LlmJudge } from './llm-judge.js';
import { MockJudge } from './mock-judge.js';

export interface JudgeInput {
  runId: string;
  scenario: Scenario;
  transcript: Transcript;
}

export interface Judge {
  judge(input: JudgeInput): Promise<Report>;
}

export interface JudgeOptions {
  provider?: LlmProviderName;
  model?: string;
  baseUrl?: string;
}

export function createJudge(options: JudgeOptions = {}): Judge {
  const provider = options.provider ?? 'mock';
  if (provider === 'mock') return new MockJudge();
  return new LlmJudge(resolveProviderOptions({ provider, model: options.model, baseUrl: options.baseUrl }));
}
