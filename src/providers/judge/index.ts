import type { Scenario } from '../../schemas/scenario.schema.js';
import type { Transcript } from '../../schemas/transcript.schema.js';
import { statusFromScore } from '../../core/scoring.js';
import type { CriterionResult, Report, ReportFailure } from '../../schemas/report.schema.js';
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

export type JudgeMode = 'rules' | 'semantic' | 'hybrid';

export interface JudgeOptions {
  mode?: JudgeMode;
  provider?: LlmProviderName;
  model?: string;
  baseUrl?: string;
}

export function createJudge(options: JudgeOptions = {}): Judge {
  const mode = options.mode ?? (options.provider && options.provider !== 'mock' ? 'semantic' : 'rules');
  if (mode === 'rules') return new MockJudge();

  const provider = options.provider ?? 'mock';
  if (provider === 'mock') return new MockJudge();
  const semantic = new LlmJudge(resolveProviderOptions({ provider, model: options.model, baseUrl: options.baseUrl }));
  if (mode === 'hybrid') return new HybridJudge(semantic, new MockJudge(), provider, options.model);
  return semantic;
}

class HybridJudge implements Judge {
  constructor(
    private readonly semantic: Judge,
    private readonly rules: Judge,
    private readonly provider: LlmProviderName,
    private readonly model: string | undefined,
  ) {}

  async judge(input: JudgeInput): Promise<Report> {
    const semantic = await this.semantic.judge(input);
    const rules = await this.rules.judge(input);
    const addedFailures = mergeFailures(semantic.failures, rules.failures);
    const addedCriteria = mergeCriteria(semantic.criteria, rules.criteria);
    const failures = [...semantic.failures, ...addedFailures];
    const criteria = [...semantic.criteria, ...addedCriteria];
    const recommendations = [...semantic.recommendations];
    for (const recommendation of rules.recommendations) {
      if (!recommendations.includes(recommendation)) recommendations.push(recommendation);
    }

    return {
      ...semantic,
      score: Math.min(semantic.score, rules.score),
      status: statusFromScore(Math.min(semantic.score, rules.score), failures),
      criteria,
      failures,
      recommendations,
      judgeMetadata: {
        mode: 'hybrid',
        provider: this.provider,
        model: this.model ?? semantic.judgeMetadata?.model,
        rulesApplied: true,
        deterministicFindingsAdded: addedFailures.length,
      },
      rawJudgeOutput: {
        semantic: semantic.rawJudgeOutput,
        rules: {
          score: rules.score,
          failures: rules.failures,
          criteria: rules.criteria,
        },
      },
    };
  }
}

function mergeFailures(existing: ReportFailure[], candidates: ReportFailure[]) {
  const seen = new Set(existing.map((failure) => `${failure.type}:${failure.message}`));
  return candidates.filter((failure) => !seen.has(`${failure.type}:${failure.message}`));
}

function mergeCriteria(existing: CriterionResult[], candidates: CriterionResult[]) {
  const seen = new Set(existing.map((criterion) => criterion.criterion));
  return candidates.filter((criterion) => criterion.result === 'failed' && !seen.has(criterion.criterion));
}
