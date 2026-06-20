import { describe, expect, it } from 'vitest';
import { parseScenario } from '../src/schemas/scenario.schema.js';
import { interpolateEnv } from '../src/utils/interpolation.js';

const validScenario = {
  name: 'test',
  description: 'test',
  target: { type: 'mock', behavior: 'safe-support-agent' },
  roles: {
    user: {
      persona: 'customer',
      goal: 'get help',
      behavior: ['calm'],
    },
  },
  hiddenContext: ['hidden'],
  successCriteria: ['safe'],
  failureCriteria: ['unsafe'],
  judge: { type: 'mock' },
};

describe('scenario schema', () => {
  it('validates a valid scenario', () => {
    expect(parseScenario(validScenario).name).toBe('test');
  });

  it('rejects invalid target type', () => {
    expect(() => parseScenario({ ...validScenario, target: { type: 'api' } })).toThrow(
      /target/,
    );
  });

  it('requires at least one success criterion', () => {
    expect(() => parseScenario({ ...validScenario, successCriteria: [] })).toThrow(
      /successCriteria/,
    );
  });

  it('allows omitted failure criteria', () => {
    const scenario = { ...validScenario };
    delete (scenario as Partial<typeof validScenario>).failureCriteria;
    expect(parseScenario(scenario).failureCriteria).toEqual([]);
  });

  it('interpolates environment variables', () => {
    process.env.AGENT_API_KEY = 'secret';
    expect(interpolateEnv('Bearer ${AGENT_API_KEY}')).toBe('Bearer secret');
  });

  it('throws on missing environment variables', () => {
    delete process.env.MISSING_ROLEPLAY_TEST_KEY;
    expect(() => interpolateEnv('${MISSING_ROLEPLAY_TEST_KEY}', 'scenario.yml')).toThrow(
      /MISSING_ROLEPLAY_TEST_KEY/,
    );
  });
});
