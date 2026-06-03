import { Flags } from '@oclif/core';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BaseCommand } from './base.js';
import { ensureDir } from '../utils/fs.js';
import { redteamTemplates } from '../templates/scenarios.js';
import { runScenario } from '../core/engine.js';
import { AppError } from '../core/errors.js';

export class RedteamCommand extends BaseCommand {
  static description = 'Generate and run built-in red-team scenarios.';
  static flags = {
    target: Flags.string({ description: 'HTTP target URL.' }),
    'target-command': Flags.string({ description: 'CLI target command.' }),
    provider: Flags.string({ options: ['openai', 'mock'], default: 'mock' }),
    judge: Flags.string({ options: ['openai', 'mock'], default: 'mock' }),
    model: Flags.string({ default: 'gpt-4.1-mini' }),
    yes: Flags.boolean({ char: 'y' }),
    save: Flags.boolean({ description: 'Save generated red-team scenarios under .roleplay/scenarios/redteam.' }),
    json: Flags.boolean({ description: 'Output JSON only.' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RedteamCommand);
    if (Boolean(flags.target) === Boolean(flags['target-command'])) {
      throw new AppError({
        code: 'REDTEAM_TARGET_REQUIRED',
        message: 'Provide exactly one red-team target.',
        suggestion: 'Use --target http://localhost:3000/agent or --target-command "node ./agent.js".',
        exitCode: 2,
      });
    }

    const target = flags.target
      ? ({ type: 'http', url: flags.target } as const)
      : ({ type: 'cli', command: flags['target-command'] as string } as const);
    const scenarioDir = flags.save
      ? '.roleplay/scenarios/redteam'
      : await fs.mkdtemp(join(tmpdir(), 'roleplay-redteam-'));
    await ensureDir(scenarioDir);
    const files: string[] = [];

    try {
      for (const content of redteamTemplates(target)) {
        const name = content.match(/^name:\s*(.+)$/m)?.[1] ?? `redteam-${files.length + 1}`;
        const path = join(scenarioDir, `${name}.yml`);
        await fs.writeFile(path, content, 'utf8');
        files.push(path);
      }

      const results = [];
      for (const file of files) {
        const result = await runScenario({
          scenarioRef: file,
          provider: flags.provider as 'openai' | 'mock',
          judge: flags.judge as 'openai' | 'mock',
          model: flags.model,
          yes: flags.yes,
        });
        results.push({
          runId: result.runId,
          scenario: result.scenario.name,
          status: result.report.status,
          score: result.report.score,
        });
      }

      if (flags.json) this.log(JSON.stringify({ results, savedScenarios: flags.save ? files : [] }));
      else
        this.log(
          results
            .map(
              (result) =>
                `${result.status.toUpperCase()} ${result.score}/100 ${result.scenario} ${result.runId}`,
            )
            .join('\n'),
        );
    } finally {
      if (!flags.save) await fs.rm(scenarioDir, { recursive: true, force: true });
    }
  }
}
