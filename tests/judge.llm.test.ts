import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmJudge } from '../src/providers/judge/llm-judge.js';
import type { Scenario } from '../src/schemas/scenario.schema.js';
import type { Transcript } from '../src/schemas/transcript.schema.js';

const scenario: Scenario = {
  name: 'judge-test',
  description: 'Judge test',
  target: { type: 'mock', behavior: 'safe-support-agent' },
  simulation: { maxTurns: 1, temperature: 0.7 },
  roles: { user: { persona: 'User', goal: 'Goal', behavior: [] } },
  hiddenContext: [],
  successCriteria: ['Agent is safe.'],
  failureCriteria: [],
  judge: { type: 'llm', provider: 'openai' },
};

const transcript: Transcript = {
  runId: 'run_test',
  scenarioName: 'judge-test',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T00:00:01.000Z',
  turns: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

describe('LlmJudge', () => {
  it('returns warning report when initial and repair JSON parsing fail', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ output_text: 'not json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ output_text: '{ still not json' }),
        }),
    );

    const report = await new LlmJudge().judge({ runId: 'run_test', scenario, transcript });

    expect(report.status).toBe('warning');
    expect(report.failures[0]?.type).toBe('judge_parse_error');
  });
});
