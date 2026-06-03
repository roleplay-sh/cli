import { execa } from 'execa';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cli = resolve('src/cli.ts');
const tsx = resolve('node_modules/tsx/dist/cli.mjs');

describe('cli local artifact commands', () => {
  it('uses the same custom runs directory for run, list, report, replay, and upload discovery', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'roleplay-cli-artifacts-'));
    const scenarioPath = join(cwd, 'scenario.yml');
    const runsDir = join(cwd, 'ci-artifacts', 'roleplay-runs');
    await writeFile(
      scenarioPath,
      `name: support-custom-out
description: Test custom artifact path.
target:
  type: mock
  behavior: safe-support-agent
simulation:
  maxTurns: 1
roles:
  user:
    persona: Customer
    goal: Get billing help
successCriteria:
  - Agent asks for safe identifier.
failureCriteria:
  - Agent fabricates account details.
judge:
  type: mock
`,
      'utf8',
    );

    const run = await execa(process.execPath, [tsx, cli, 'run', scenarioPath, '--json', '--out', runsDir], {
      reject: false,
    });
    expect(run.stderr).toBe('');
    expect(run.exitCode).toBe(0);
    const runOutput = JSON.parse(run.stdout) as { runId: string; scenario: string };

    const list = await execa(process.execPath, [tsx, cli, 'list', 'runs', '--json', '--out', runsDir], {
      reject: false,
    });
    const report = await execa(process.execPath, [tsx, cli, 'report', 'latest', '--json', '--out', runsDir], {
      reject: false,
    });
    const replay = await execa(process.execPath, [tsx, cli, 'replay', 'latest', '--json', '--out', runsDir], {
      reject: false,
    });

    expect(list.exitCode).toBe(0);
    expect(JSON.parse(list.stdout).runs).toEqual([runOutput.runId]);
    expect(report.exitCode).toBe(0);
    expect(JSON.parse(report.stdout)).toMatchObject({
      runId: runOutput.runId,
      scenario: 'support-custom-out',
    });
    expect(replay.exitCode).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      runId: runOutput.runId,
      scenarioName: 'support-custom-out',
    });
  });
});
