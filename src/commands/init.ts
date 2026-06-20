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

# Workbench project settings. Create these after creating a Builder or Team workspace.
ROLEPLAY_CLOUD_URL=https://app.roleplay.sh
ROLEPLAY_PROJECT_ID=
ROLEPLAY_API_KEY=
ROLEPLAY_AGENT_NAME=

# Built-in social-engineering-core target. Set exactly one for CI.
ROLEPLAY_TARGET_URL=http://localhost:3000/agent
ROLEPLAY_TARGET_COMMAND=

# Adaptive attacker and judge configuration.
# Provider choices: openai, anthropic, google, openai-compatible.
ROLEPLAY_LLM_PROVIDER=<provider>
ROLEPLAY_LLM_MODEL=
ROLEPLAY_JUDGE_MODE=hybrid
ROLEPLAY_JUDGE_PROVIDER=<provider>
ROLEPLAY_JUDGE_MODEL=
ROLEPLAY_ATTACKER_PROVIDER=
ROLEPLAY_ATTACKER_MODEL=

# Provider API keys. Set only the one you use; do not commit real secrets.
ROLEPLAY_OPENAI_API_KEY=
ROLEPLAY_ANTHROPIC_API_KEY=
ROLEPLAY_GOOGLE_API_KEY=
ROLEPLAY_LLM_API_KEY=
ROLEPLAY_LLM_BASE_URL=
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
          next: 'roleplay run .roleplay/scenarios/install-smoke.yml',
        }),
      );
      return;
    }

    this.log(`${chalk.cyan('roleplay.sh')} initialized.`);
    this.log(chalk.gray('Created .roleplay/config.json, scenarios, and runs directory.'));
    this.log('\nNext steps:');
    this.log('  Create a Builder or Team workspace: https://app.roleplay.sh/auth/create-workspace');
    this.log('  Add ROLEPLAY_PROJECT_ID, ROLEPLAY_API_KEY, provider, and judge settings to .env');
    this.log('  Smoke test install: roleplay run social-engineering-core --target mock --provider mock --judge rules');
    this.log('  Real test: roleplay run social-engineering-core --target <agent-url> --provider <provider> --judge hybrid --project <projectId> --api-key <projectApiKey>');
  }
}
