import { Flags } from '@oclif/core';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { BaseCommand } from './base.js';
import { defaultConfig } from '../templates/config.js';
import { scenarioTemplates } from '../templates/scenarios.js';
import { ensureDir, pathExists, writeJson } from '../utils/fs.js';

const envExample = `# Optional agent credentials used by your own HTTP/CLI target.
AGENT_API_KEY=

# Team Cloud upload settings.
ROLEPLAY_CLOUD_URL=http://127.0.0.1:3000
ROLEPLAY_PROJECT_ID=proj_support
ROLEPLAY_API_KEY=
ROLEPLAY_AGENT_NAME=support-agent-staging

# Built-in social-engineering-core target. Set exactly one for CI.
ROLEPLAY_TARGET_URL=http://localhost:3000/agent
ROLEPLAY_TARGET_COMMAND=
`;

export class InitCommand extends BaseCommand {
  static description = 'Initialize roleplay.sh in this repository.';
  static flags = {
    json: Flags.boolean({ description: 'Output JSON only.' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(InitCommand);
    await ensureDir('.roleplay/scenarios');
    await ensureDir('.roleplay/runs');

    const configPath = '.roleplay/config.json';
    if (!(await pathExists(configPath))) await writeJson(configPath, defaultConfig());

    for (const [name, content] of Object.entries(scenarioTemplates)) {
      const path = join('.roleplay/scenarios', `${name}.yml`);
      if (!(await pathExists(path))) await fs.writeFile(path, content, 'utf8');
    }

    if (!(await pathExists('.env.example'))) {
      await fs.writeFile('.env.example', envExample, 'utf8');
    }

    if (flags.json) {
      this.log(
        JSON.stringify({
          created: ['.roleplay/config.json', '.roleplay/scenarios', '.roleplay/runs'],
          next: 'roleplay run .roleplay/scenarios/refund-policy-edge-case.yml',
        }),
      );
      return;
    }

    this.log(`${chalk.cyan('roleplay.sh')} initialized.`);
    this.log(chalk.gray('Created .roleplay/config.json, scenarios, and runs directory.'));
    this.log('\nNext steps:');
    this.log('  roleplay run .roleplay/scenarios/refund-policy-edge-case.yml');
    this.log('  roleplay report latest');
  }
}
