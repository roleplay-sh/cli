import { Args, Flags } from '@oclif/core';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { BaseCommand } from '../base.js';
import { ensureDir, pathExists } from '../../utils/fs.js';
import { namedTemplate, type ScenarioTemplateName } from '../../templates/scenarios.js';
import { AppError } from '../../core/errors.js';

const templates = ['support', 'redteam', 'happy-path'] as const;

export class ScenarioCreateCommand extends BaseCommand {
  static description = 'Create a scenario from a built-in template.';
  static args = {
    name: Args.string({ required: false }),
  };
  static flags = {
    template: Flags.string({ options: templates, default: 'support' }),
    name: Flags.string({ description: 'Scenario name.' }),
    json: Flags.boolean({ description: 'Output JSON only.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ScenarioCreateCommand);
    const name = flags.name ?? args.name;
    if (!name) {
      throw new AppError({
        code: 'SCENARIO_NAME_REQUIRED',
        message: 'Scenario name is required.',
        suggestion: 'Use roleplay scenario:create my-scenario or --name my-scenario.',
        exitCode: 2,
      });
    }
    await ensureDir('.roleplay/scenarios');
    const path = join('.roleplay/scenarios', `${name}.yml`);
    if (await pathExists(path)) {
      throw new AppError({
        code: 'SCENARIO_EXISTS',
        message: `Scenario already exists: ${path}`,
        suggestion: 'Choose a different name or edit the existing file.',
        filePath: path,
        exitCode: 2,
      });
    }
    await fs.writeFile(path, namedTemplate(flags.template as ScenarioTemplateName, name), 'utf8');
    if (flags.json) this.log(JSON.stringify({ path, name }));
    else this.log(`Created ${path}`);
  }
}
