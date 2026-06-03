import type { Scenario } from '../../schemas/scenario.schema.js';
import type { Transcript } from '../../schemas/transcript.schema.js';
import type { Report } from '../../schemas/report.schema.js';
import { LlmJudge } from './llm-judge.js';
import { MockJudge } from './mock-judge.js';

export interface JudgeInput {
  runId: string;
  scenario: Scenario;
  transcript: Transcript;
  model?: string;
}

export interface Judge {
  judge(input: JudgeInput): Promise<Report>;
}

export function createJudge(type: 'openai' | 'mock', model?: string): Judge {
  if (type === 'openai') return new LlmJudge(model);
  return new MockJudge();
}
