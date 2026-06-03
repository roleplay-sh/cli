import type { Scenario } from '../../schemas/scenario.schema.js';
import type { Transcript } from '../../schemas/transcript.schema.js';
import type { Report } from '../../schemas/report.schema.js';
import { MockJudge } from './mock-judge.js';

export interface JudgeInput {
  runId: string;
  scenario: Scenario;
  transcript: Transcript;
}

export interface Judge {
  judge(input: JudgeInput): Promise<Report>;
}

export function createJudge(_type: 'mock' = 'mock'): Judge {
  return new MockJudge();
}
