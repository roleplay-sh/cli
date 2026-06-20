import { Flags } from '@oclif/core';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promises as fs } from 'node:fs';
import chalk from 'chalk';
import { BaseCommand } from './base.js';
import { ensureDir, pathExists } from '../utils/fs.js';

const providers = ['openai', 'anthropic', 'google', 'openai-compatible'] as const;
const judgeModes = ['rules', 'semantic', 'hybrid'] as const;

export class SetupCommand extends BaseCommand {
  static description = 'Guided Workbench and local runner setup.';
  static flags = {
    json: Flags.boolean({ description: 'Output JSON only.' }),
    'cloud-url': Flags.string({
      description: 'Workbench URL.',
      default: process.env.ROLEPLAY_CLOUD_URL ?? 'https://app.roleplay.sh',
    }),
    project: Flags.string({ description: 'Workbench project ID. Defaults to ROLEPLAY_PROJECT_ID.' }),
    provider: Flags.string({ options: [...providers], description: 'Provider for adaptive attacker turns.' }),
    judge: Flags.string({ options: [...judgeModes], description: 'Judge mode: rules, semantic, or hybrid.' }),
    'judge-provider': Flags.string({ options: [...providers], description: 'Provider for semantic/hybrid judging.' }),
    target: Flags.string({ description: 'HTTP target URL.' }),
    'target-command': Flags.string({ description: 'CLI target command.' }),
    yes: Flags.boolean({ char: 'y', description: 'Accept defaults without prompting.' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SetupCommand);
    const answers = flags.yes
      ? fromFlags(flags)
      : await promptForSetup(fromFlags(flags));

    await ensureDir('.roleplay/scenarios');
    await ensureDir('.roleplay/runs');
    if (!(await pathExists('.roleplay/config.json'))) {
      await fs.mkdir('.roleplay', { recursive: true });
      await fs.writeFile('.roleplay/config.json', JSON.stringify({ version: 1, runsDir: '.roleplay/runs' }, null, 2));
    }

    const env = buildEnvExample(answers);
    await fs.writeFile('.env.example', env, 'utf8');

    if (flags.json) {
      this.log(
        JSON.stringify({
          wrote: ['.env.example', '.roleplay/config.json', '.roleplay/scenarios', '.roleplay/runs'],
          cloudUrl: answers.cloudUrl,
          project: answers.project || undefined,
          provider: answers.provider || undefined,
          judge: answers.judge,
          judgeProvider: answers.judgeProvider || undefined,
          target: answers.target || answers.targetCommand || undefined,
        }),
      );
      return;
    }

    this.log(`${chalk.cyan('roleplay.sh setup complete')}`);
    this.log(chalk.gray('Wrote safe placeholders to .env.example. Raw API keys were not stored.'));
    this.log('\nNext steps:');
    this.log('  1. Copy .env.example to .env and fill in secrets locally or in CI.');
    this.log('  2. Smoke test: roleplay run social-engineering-core --target mock --provider mock --judge rules');
    this.log('  3. Real test: roleplay run social-engineering-core --target <agent-url> --provider <provider> --judge hybrid');
    this.log('  4. Upload proof: roleplay upload all --mode sanitized_findings');
  }
}

interface SetupAnswers {
  cloudUrl: string;
  project: string;
  provider: string;
  judge: string;
  judgeProvider: string;
  target: string;
  targetCommand: string;
}

function fromFlags(flags: {
  'cloud-url': string;
  project?: string;
  provider?: string;
  judge?: string;
  'judge-provider'?: string;
  target?: string;
  'target-command'?: string;
}): SetupAnswers {
  return {
    cloudUrl: flags['cloud-url'],
    project: flags.project ?? process.env.ROLEPLAY_PROJECT_ID ?? '',
    provider: flags.provider ?? process.env.ROLEPLAY_LLM_PROVIDER ?? '',
    judge: flags.judge ?? process.env.ROLEPLAY_JUDGE_MODE ?? 'hybrid',
    judgeProvider: flags['judge-provider'] ?? process.env.ROLEPLAY_JUDGE_PROVIDER ?? flags.provider ?? process.env.ROLEPLAY_LLM_PROVIDER ?? '',
    target: flags.target ?? process.env.ROLEPLAY_TARGET_URL ?? '',
    targetCommand: flags['target-command'] ?? process.env.ROLEPLAY_TARGET_COMMAND ?? '',
  };
}

async function promptForSetup(defaults: SetupAnswers): Promise<SetupAnswers> {
  const rl = createInterface({ input, output });
  try {
    const cloudUrl = await ask(rl, 'Workbench URL', defaults.cloudUrl);
    const project = await ask(rl, 'Project ID', defaults.project);
    const provider = await ask(rl, 'Attacker provider (openai, anthropic, google, openai-compatible)', defaults.provider);
    const judge = await ask(rl, 'Judge mode (rules, semantic, hybrid)', defaults.judge || 'hybrid');
    const judgeProvider = await ask(rl, 'Judge provider for semantic/hybrid mode', defaults.judgeProvider || provider);
    const target = await ask(rl, 'HTTP target URL (leave blank if using a CLI target)', defaults.target);
    const targetCommand = target ? '' : await ask(rl, 'CLI target command (optional)', defaults.targetCommand);
    return { cloudUrl, project, provider, judge, judgeProvider, target, targetCommand };
  } finally {
    rl.close();
  }
}

async function ask(rl: ReturnType<typeof createInterface>, label: string, fallback: string) {
  const suffix = fallback ? ` (${fallback})` : '';
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || fallback;
}

function buildEnvExample(input: SetupAnswers) {
  const targetUrl = input.target || 'http://localhost:3000/agent';
  return `# Agent credentials used by your own HTTP/CLI target.
AGENT_API_KEY=

# Workbench project settings. Create these after creating a Builder or Team workspace.
ROLEPLAY_CLOUD_URL=${input.cloudUrl}
ROLEPLAY_PROJECT_ID=${input.project}
ROLEPLAY_API_KEY=
ROLEPLAY_AGENT_NAME=

# Built-in social-engineering-core target. Set exactly one for CI.
ROLEPLAY_TARGET_URL=${targetUrl}
ROLEPLAY_TARGET_COMMAND=${input.targetCommand}

# Adaptive attacker and judge configuration.
# Provider choices: openai, anthropic, google, openai-compatible.
ROLEPLAY_LLM_PROVIDER=${input.provider || '<provider>'}
ROLEPLAY_LLM_MODEL=
ROLEPLAY_JUDGE_MODE=${input.judge || 'hybrid'}
ROLEPLAY_JUDGE_PROVIDER=${input.judgeProvider || '<provider>'}
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
}
