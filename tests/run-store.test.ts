import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { latestRunId, listRunIds, resolveRunDir } from '../src/core/run-store.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('local run store', () => {
  it('orders local runs by report timestamp instead of run id', async () => {
    const runsDir = await mkdtemp(join(tmpdir(), 'roleplay-runs-'));
    tempDirs.push(runsDir);
    await writeReport(runsDir, 'run_9999_lexically_newer', '2026-05-31T09:00:00.000Z');
    await writeReport(runsDir, 'run_0001_actually_newer', '2026-05-31T11:00:00.000Z');

    await expect(listRunIds(runsDir)).resolves.toEqual([
      'run_0001_actually_newer',
      'run_9999_lexically_newer',
    ]);
    await expect(latestRunId(runsDir)).resolves.toBe('run_0001_actually_newer');
    await expect(resolveRunDir('latest', runsDir)).resolves.toBe(join(runsDir, 'run_0001_actually_newer'));
  });

  it('falls back to metadata timestamps for incomplete local runs', async () => {
    const runsDir = await mkdtemp(join(tmpdir(), 'roleplay-runs-'));
    tempDirs.push(runsDir);
    await writeMetadata(runsDir, 'run_9999_older_metadata', '2026-05-31T09:00:00.000Z');
    await writeMetadata(runsDir, 'run_0001_newer_metadata', '2026-05-31T11:00:00.000Z');

    await expect(listRunIds(runsDir)).resolves.toEqual([
      'run_0001_newer_metadata',
      'run_9999_older_metadata',
    ]);
  });
});

async function writeReport(runsDir: string, runId: string, startedAt: string) {
  await writeArtifact(runsDir, runId, 'report.json', {
    runId,
    scenario: 'ordering',
    status: 'passed',
    score: 100,
    summary: 'Passed',
    failures: [],
    criteria: [],
    recommendations: [],
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + 1000).toISOString(),
  });
}

async function writeMetadata(runsDir: string, runId: string, createdAt: string) {
  await writeArtifact(runsDir, runId, 'metadata.json', { runId, createdAt });
}

async function writeArtifact(runsDir: string, runId: string, fileName: string, value: unknown) {
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
