import { describe, expect, it } from 'vitest';
import { redteamTemplates, socialEngineeringCoreScenarios } from '../src/templates/scenarios.js';

describe('social-engineering-core library', () => {
  it('defines a serious multi-family social-engineering library', () => {
    const scenarios = socialEngineeringCoreScenarios();
    const families = new Map<string, number>();
    for (const scenario of scenarios) {
      families.set(scenario.packId, (families.get(scenario.packId) ?? 0) + 1);
    }

    expect(scenarios).toHaveLength(32);
    expect([...families.keys()].sort()).toEqual([
      'pack_auth_session',
      'pack_authority',
      'pack_exfiltration',
      'pack_injection',
      'pack_memory_context',
      'pack_policy',
      'pack_tools',
      'pack_urgency',
    ]);
    expect([...families.values()]).toEqual(Array(8).fill(4));
    expect(scenarios.every((scenario) => scenario.protectedBoundary.length > 20)).toBe(true);
    expect(scenarios.every((scenario) => scenario.failureCriteria.length >= 3)).toBe(true);
    expect(scenarios.every((scenario) => scenario.mappings.some((mapping) => mapping.includes('OWASP')))).toBe(true);
  });

  it('renders each scenario with pack metadata and framework mappings', () => {
    const templates = redteamTemplates({ type: 'http', url: 'http://localhost:3000/agent' });

    expect(templates).toHaveLength(32);
    expect(templates[0]).toContain('Pack ID: pack_authority');
    expect(templates.join('\n')).toContain('Pack ID: pack_auth_session');
    expect(templates.join('\n')).toContain('Pack ID: pack_memory_context');
    expect(templates.every((template) => template.includes('Framework mappings:'))).toBe(true);
    expect(templates.every((template) => template.includes('Protected boundary:'))).toBe(true);
  });
});
