import type { Scenario } from '../../schemas/scenario.schema.js';
import type { Transcript } from '../../schemas/transcript.schema.js';
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

export function createUserSimulator(): UserSimulator {
  return new LocalUserSimulator();
}
