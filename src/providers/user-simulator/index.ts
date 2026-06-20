import type { Scenario } from '../../schemas/scenario.schema.js';
import type { Transcript } from '../../schemas/transcript.schema.js';
import { resolveProviderOptions, type LlmProviderName } from '../llm/client.js';
import { LlmUserSimulator } from './llm-user-simulator.js';
import { LocalUserSimulator } from './local-user-simulator.js';

export interface UserSimulationInput {
  scenario: Scenario;
  transcript: Transcript;
  turn: number;
  temperature?: number;
  purpose: 'roleplayed-user';
}

export interface UserSimulationOutput {
  content: string;
  raw?: unknown;
}

export interface UserSimulator {
  generate(input: UserSimulationInput): Promise<UserSimulationOutput>;
}

export interface UserSimulatorOptions {
  provider?: LlmProviderName;
  model?: string;
  baseUrl?: string;
}

export function createUserSimulator(options: UserSimulatorOptions = {}): UserSimulator {
  const provider = options.provider ?? 'mock';
  if (provider === 'mock') return new LocalUserSimulator();
  return new LlmUserSimulator(resolveProviderOptions({ provider, model: options.model, baseUrl: options.baseUrl }));
}
