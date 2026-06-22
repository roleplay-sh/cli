#!/usr/bin/env node
import { Args, Command } from '@oclif/core';
import chalk from 'chalk';
import { AppError } from './core/errors.js';
import { printError } from './utils/output.js';

const helpText: Record<string, string> = {
  root: `${chalk.cyan('roleplay.sh')} - Included local runner for the roleplay.sh Workbench.

Usage:
  roleplay setup
  roleplay init
  roleplay run social-engineering-core --target mock --provider mock --judge rules
  roleplay run social-engineering-core --target <url> --provider <provider> --judge hybrid --project <projectId>
  roleplay report latest|<runId> [--out .roleplay/runs]
  roleplay replay latest|<runId> [--out .roleplay/runs]
  roleplay upload latest|all --project <projectId>
  roleplay list scenarios|runs
  roleplay doctor --cloud
  roleplay mcp

Jobs:
  Setup            roleplay setup
  Run packs        roleplay run social-engineering-core --target <url> --provider <provider> --judge hybrid
  Review evidence  roleplay report latest && roleplay replay latest
  Upload proof     roleplay upload all --mode sanitized_findings
  Verify fixes     rerun the same scenario or regression key after remediation
  Diagnose         roleplay doctor --cloud
  Monitor          schedule the same command in CI or a recurring workflow

Use mock mode for install smoke tests. Use a project API key for real agent tests. The core pack is the baseline; specialized social-engineering packs use the same local-run and upload workflow.`,
  run: `${chalk.cyan('roleplay run')} - Run a scenario or the built-in social-engineering-core attack pack.

Smoke test:
  roleplay run social-engineering-core --target mock --provider mock --judge rules --fail-on critical

Real HTTP target:
  roleplay run social-engineering-core --target <agent-url> --provider <provider> --judge hybrid --project <projectId> --api-key <projectApiKey>

Real CLI target:
  roleplay run social-engineering-core --target-command "node ./agent.js" --provider <provider> --judge hybrid --project <projectId> --api-key <projectApiKey> --yes

Useful flags:
  --provider <provider>          Attacker and judge provider shortcut.
  --attacker-provider <provider> Provider for adaptive attacker turns.
  --judge rules|semantic|hybrid  How transcript results are evaluated.
  --judge-provider <provider>    Provider for semantic/hybrid judging.
  --allow-rules-only             Permit deterministic-only judging for real targets.
  --project <projectId>          Workbench project ID.
  --api-key <key>                Workbench project API key.
  --json                         Machine-readable output.`,
  doctor: `${chalk.cyan('roleplay doctor')} - Check install, Workbench, provider, judge, and upload readiness.

Usage:
  roleplay doctor
  roleplay doctor --cloud --provider <provider> --judge hybrid
  roleplay doctor --cloud --project <projectId> --api-key <projectApiKey> --json

Checks:
  install smoke readiness
  Workbench health and entitlement
  attacker provider key
  judge mode and judge provider key
  upload readiness`,
  setup: `${chalk.cyan('roleplay setup')} - Guided Workbench and local runner setup.

Usage:
  roleplay setup
  roleplay setup --project <projectId> --provider <provider> --judge hybrid --target http://localhost:3000/agent

The setup command writes safe placeholders to .env.example and never stores raw API keys by default.`,
};

class HelpCommand extends Command {
  static description = 'roleplay.sh CLI';
  static args = {
    command: Args.string({ required: false }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(HelpCommand);
    this.log(helpText[args.command ?? 'root'] ?? helpText.root);
  }
}

const rawArgv = process.argv.slice(2);
if (rawArgv.includes('--no-color')) {
  process.env.NO_COLOR = '1';
}
const argv = rawArgv.filter((arg) => arg !== '--no-color');
const command = argv[0];
const rest = argv.slice(1);

type RunnableCommand = {
  run(argv?: string[], options?: unknown): Promise<unknown>;
};

type CommandLoader = () => Promise<RunnableCommand>;

const loadHelpCommand: CommandLoader = async () => HelpCommand;

const commands: Record<string, CommandLoader> = {
  setup: async () => (await import('./commands/setup.js')).SetupCommand,
  init: async () => (await import('./commands/init.js')).InitCommand,
  'scenario:create': async () => (await import('./commands/scenario/create.js')).ScenarioCreateCommand,
  run: async () => (await import('./commands/run.js')).RunCommand,
  upload: async () => (await import('./commands/upload.js')).UploadCommand,
  report: async () => (await import('./commands/report.js')).ReportCommand,
  replay: async () => (await import('./commands/replay.js')).ReplayCommand,
  list: async () => (await import('./commands/list.js')).ListCommand,
  doctor: async () => (await import('./commands/doctor.js')).DoctorCommand,
  mcp: async () => (await import('./commands/mcp.js')).McpCommand,
  help: loadHelpCommand,
  '--help': loadHelpCommand,
  '-h': loadHelpCommand,
};

if ((command === 'help' && rest[0]) || (command && rest.some((arg) => arg === '--help' || arg === '-h'))) {
  const helpCommand = command === 'help' ? rest[0] : command;
  process.stdout.write(`${helpText[helpCommand] ?? helpText.root}\n`);
  process.exit(0);
}

const commandLoader: CommandLoader | undefined = command ? commands[command] : loadHelpCommand;
if (!commandLoader) {
  printError(
    new AppError({
      code: 'UNKNOWN_COMMAND',
      message: 'Unknown command',
      exitCode: 2,
    }),
  );
  process.exit(2);
}

const CommandClass = await commandLoader();
await CommandClass.run(command && commands[command] ? rest : argv, import.meta.url);
