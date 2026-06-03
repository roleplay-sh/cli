import { promises as fs } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { AppError } from '../core/errors.js';
import { interpolateEnv } from '../utils/interpolation.js';

const stringArray = z.array(z.string()).default([]);

const httpTargetSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  headers: z.record(z.string()).default({}),
  input: z
    .object({
      messageField: z.string().default('message'),
      sessionField: z.string().default('sessionId'),
    })
    .default({}),
  output: z
    .object({
      responseField: z.string().default('response'),
    })
    .default({}),
  timeoutMs: z.number().int().positive().default(30_000),
});

const cliTargetSchema = z.object({
  type: z.literal('cli'),
  command: z.string().min(1),
  mode: z.enum(['stdin', 'arg']).default('stdin'),
  shell: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(30_000),
});

const mockTargetSchema = z.object({
  type: z.literal('mock'),
  behavior: z
    .enum(['naive-refund-agent', 'safe-support-agent', 'prompt-injection-vulnerable'])
    .default('safe-support-agent'),
});

export const scenarioSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  target: z.discriminatedUnion('type', [httpTargetSchema, cliTargetSchema, mockTargetSchema]),
  simulation: z
    .object({
      maxTurns: z.number().int().positive().max(50).default(8),
      temperature: z.number().min(0).max(2).default(0.7),
    })
    .default({}),
  roles: z.object({
    user: z.object({
      persona: z.string().min(1),
      goal: z.string().min(1),
      behavior: stringArray,
    }),
  }),
  hiddenContext: stringArray,
  successCriteria: z.array(z.string()).min(1, 'must include at least one success criterion'),
  failureCriteria: stringArray,
  judge: z
    .object({
      type: z.enum(['llm', 'mock']).default('mock'),
      provider: z.enum(['openai', 'mock']).optional(),
      model: z.string().optional(),
      rubric: z.record(z.number()).optional(),
    })
    .default({ type: 'mock' }),
  output: z
    .object({
      expectations: stringArray,
    })
    .optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type TargetConfig = Scenario['target'];

export function parseScenario(input: unknown, filePath?: string): Scenario {
  const interpolated = interpolateEnv(input, filePath);
  const result = scenarioSchema.safeParse(interpolated);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new AppError({
      code: 'INVALID_SCENARIO',
      message: first
        ? `${first.path.join('.') || 'scenario'} ${first.message}`
        : 'Invalid scenario file.',
      suggestion: 'Edit the scenario YAML so it matches the supported roleplay.sh schema.',
      filePath,
      exitCode: 2,
      cause: result.error,
    });
  }
  return result.data;
}

export async function loadScenarioFile(path: string): Promise<Scenario> {
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (error) {
    throw new AppError({
      code: 'SCENARIO_NOT_FOUND',
      message: `Could not read scenario file: ${path}`,
      suggestion: 'Run roleplay list scenarios or check the path.',
      filePath: path,
      exitCode: 2,
      cause: error,
    });
  }

  try {
    return parseScenario(parseYaml(raw), path);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: 'INVALID_SCENARIO_YAML',
      message: `Could not parse scenario YAML: ${path}`,
      suggestion: 'Check the YAML syntax and indentation.',
      filePath: path,
      exitCode: 2,
      cause: error,
    });
  }
}
