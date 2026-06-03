import { Flags } from '@oclif/core';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { BaseCommand } from './base.js';
import { listRunIds } from '../core/run-store.js';
import { pathExists } from '../utils/fs.js';

export class ListCommand extends BaseCommand {
  static description = 'List local scenarios or runs.';
  static strict = false;
  static flags = {
    json: Flags.boolean({ description: 'Output JSON only.' }),
    out: Flags.string({ default: '.roleplay/runs', description: 'Runs directory when listing runs.' }),
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(ListCommand);
    const kind = (argv[0] as string | undefined) ?? 'scenarios';
    if (kind === 'runs') {
      const runs = await listRunIds(flags.out);
      if (flags.json) this.log(JSON.stringify({ runs }));
      else this.log(runs.length ? runs.join('\n') : chalk.gray('No runs found.'));
      return;
    }

    const dir = '.roleplay/scenarios';
    const scenarios = (await pathExists(dir))
      ? (await fs.readdir(dir)).filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
      : [];
    if (flags.json) this.log(JSON.stringify({ scenarios }));
    else this.log(scenarios.length ? scenarios.map((item) => join(dir, item)).join('\n') : chalk.gray('No scenarios found.'));
  }
}
