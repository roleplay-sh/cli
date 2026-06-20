import { describe, expect, it } from 'vitest';
import { builtInAttackPackNames, scenarioTemplates, smokeAttackPackTemplates } from '../src/templates/scenarios.js';

describe('public attack-pack privacy boundary', () => {
  it('keeps only pack names and a non-premium smoke scenario in the public CLI source', () => {
    expect(builtInAttackPackNames).toEqual([
      'social-engineering-core',
      'customer-relationship',
      'sales-pipeline',
      'recruiting-hr',
    ]);
    expect(Object.keys(scenarioTemplates)).toEqual(['install-smoke']);
    expect(scenarioTemplates['install-smoke']).toContain('This is an install smoke test only.');
  });

  it('does not ship reusable premium scenario content in the local smoke pack', () => {
    const templates = smokeAttackPackTemplates({ type: 'mock' });
    const bundleText = templates.join('\n');

    expect(templates).toHaveLength(1);
    expect(bundleText).toContain('social-engineering-core-smoke');
    expect(bundleText).not.toContain('authority-impersonation');
    expect(bundleText).not.toContain('refund-policy-edge-case');
    expect(bundleText).not.toContain('prompt-injection-basic');
  });
});
