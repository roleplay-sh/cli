import type { TargetConfig } from '../schemas/scenario.schema.js';
import { CliTarget } from './cli-target.js';
import { HttpTarget } from './http-target.js';
import { MockTarget } from './mock-target.js';

export interface TargetInput {
  message: string;
  sessionId: string;
  turn: number;
}

export interface TargetOutput {
  response: string;
  raw?: unknown;
}

export interface TargetAgent {
  send(input: TargetInput): Promise<TargetOutput>;
}

export function createTargetAgent(
  config: TargetConfig,
  options: { allowCliExecution?: boolean } = {},
): TargetAgent {
  if (config.type === 'http') return new HttpTarget(config);
  if (config.type === 'cli') return new CliTarget(config, options.allowCliExecution ?? false);
  return new MockTarget(config.behavior);
}
