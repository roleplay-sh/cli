import { promises as fs } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { Report } from '../schemas/report.schema.js';
import type { Scenario } from '../schemas/scenario.schema.js';
import type { Transcript } from '../schemas/transcript.schema.js';
import { createRunId } from '../utils/ids.js';
import { ensureDir, pathExists, writeJson } from '../utils/fs.js';
import { redactUnknown } from '../utils/output.js';
import { AppError } from './errors.js';

export interface RunPaths {
  runId: string;
  runDir: string;
  scenarioPath: string;
  transcriptPath: string;
  reportJsonPath: string;
  reportMarkdownPath: string;
  metadataPath: string;
}

export async function resolveScenarioPath(input: string, cwd = process.cwd()): Promise<string> {
  const direct = resolve(cwd, input);
  if (await pathExists(direct)) return direct;

  const withYml = resolve(cwd, '.roleplay/scenarios', `${input}.yml`);
  if (await pathExists(withYml)) return withYml;

  const withYaml = resolve(cwd, '.roleplay/scenarios', `${input}.yaml`);
  if (await pathExists(withYaml)) return withYaml;

  throw new AppError({
    code: 'SCENARIO_NOT_FOUND',
    message: `Scenario not found: ${input}`,
    suggestion: 'Use a path or run roleplay list scenarios.',
    exitCode: 2,
  });
}

export async function createRunPaths(outDir = '.roleplay/runs'): Promise<RunPaths> {
  const runId = createRunId();
  const runDir = resolve(process.cwd(), outDir, runId);
  await ensureDir(runDir);
  return {
    runId,
    runDir,
    scenarioPath: join(runDir, 'scenario.yml'),
    transcriptPath: join(runDir, 'transcript.json'),
    reportJsonPath: join(runDir, 'report.json'),
    reportMarkdownPath: join(runDir, 'report.md'),
    metadataPath: join(runDir, 'metadata.json'),
  };
}

export async function saveRun(input: {
  scenario: Scenario;
  transcript: Transcript;
  report: Report;
  markdown: string;
  paths: RunPaths;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await fs.writeFile(input.paths.scenarioPath, stringifyYaml(input.scenario), 'utf8');
  await writeJson(input.paths.transcriptPath, redactUnknown(input.transcript));
  await writeJson(input.paths.reportJsonPath, redactUnknown(input.report));
  await fs.writeFile(input.paths.reportMarkdownPath, input.markdown, 'utf8');
  await writeJson(input.paths.metadataPath, {
    ...input.metadata,
    runId: input.paths.runId,
    scenario: input.scenario.name,
    createdAt: new Date().toISOString(),
    files: {
      scenario: basename(input.paths.scenarioPath),
      transcript: basename(input.paths.transcriptPath),
      reportJson: basename(input.paths.reportJsonPath),
      reportMarkdown: basename(input.paths.reportMarkdownPath),
    },
  });
}

export function displayPath(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith('..') ? rel : path;
}

export async function listRunIds(runsDir = '.roleplay/runs'): Promise<string[]> {
  const dir = resolve(process.cwd(), runsDir);
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const runs = await Promise.all(
    entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('run_'))
      .map(async (entry) => ({
        id: entry.name,
        timestamp: await localRunTimestamp(join(dir, entry.name)),
      })),
  );
  return runs
    .sort((left, right) => {
      if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
      return right.id.localeCompare(left.id);
    })
    .map((run) => run.id);
}

export async function latestRunId(runsDir = '.roleplay/runs'): Promise<string> {
  const ids = await listRunIds(runsDir);
  if (!ids[0]) {
    throw new AppError({
      code: 'RUN_NOT_FOUND',
      message: 'No roleplay runs found.',
      suggestion: 'Run a scenario first with roleplay run <scenario>.',
      exitCode: 2,
    });
  }
  return ids[0];
}

export async function resolveRunDir(runIdOrLatest: string, runsDir = '.roleplay/runs'): Promise<string> {
  const runId = runIdOrLatest === 'latest' ? await latestRunId(runsDir) : runIdOrLatest;
  const runDir = resolve(process.cwd(), runsDir, runId);
  if (!(await pathExists(runDir))) {
    throw new AppError({
      code: 'RUN_NOT_FOUND',
      message: `Run not found: ${runId}`,
      suggestion: 'Run roleplay list runs to see available run IDs.',
      exitCode: 2,
    });
  }
  return runDir;
}

async function localRunTimestamp(runDir: string): Promise<number> {
  const reportTimestamp = await jsonDateTimestamp(join(runDir, 'report.json'), 'startedAt');
  if (reportTimestamp !== undefined) return reportTimestamp;

  const metadataTimestamp = await jsonDateTimestamp(join(runDir, 'metadata.json'), 'createdAt');
  if (metadataTimestamp !== undefined) return metadataTimestamp;

  const stat = await fs.stat(runDir).catch(() => undefined);
  return stat?.mtimeMs ?? 0;
}

async function jsonDateTimestamp(path: string, field: string): Promise<number | undefined> {
  const contents = await fs.readFile(path, 'utf8').catch(() => undefined);
  if (!contents) return undefined;
  try {
    const parsed = JSON.parse(contents.replace(/^\uFEFF/, '')) as Record<string, unknown>;
    const value = parsed[field];
    if (typeof value !== 'string') return undefined;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  } catch {
    return undefined;
  }
}
