import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runScenario } from '../src/core/engine.js';

let cwd: string;
let previousCwd: string;

const scenario = `name: install-smoke
description: Test refund.
target:
  type: mock
  behavior: naive-refund-agent
simulation:
  maxTurns: 2
roles:
  user:
    persona: Angry customer
    goal: Get refund
    behavior:
      - angry
hiddenContext:
  - Policy is 30 days.
successCriteria:
  - Agent checks policy.
failureCriteria:
  - Agent promises a refund without checking policy.
judge:
  type: mock
`;

beforeEach(async () => {
  previousCwd = process.cwd();
  cwd = await mkdtemp(join(tmpdir(), 'roleplay-test-'));
  process.chdir(cwd);
  await writeFile(join(cwd, 'refund.yml'), scenario, 'utf8');
});

afterEach(() => {
  process.chdir(previousCwd);
});

describe('mock engine', () => {
  it('runs refund scenario and saves failed report', async () => {
    const result = await runScenario({
      scenarioRef: 'refund.yml',
      outDir: '.roleplay/runs',
    });

    expect(result.report.status).toBe('failed');
    expect(result.report.failures[0]?.type).toBe('policy_violation');
    expect(result.transcript.turns.length).toBeGreaterThan(0);
  });
});
