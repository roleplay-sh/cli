#!/usr/bin/env node
import { Args, Command } from '@oclif/core';
import chalk from 'chalk';

class HelpCommand extends Command {
  static description = 'roleplay.sh CLI';
  static args = {
    command: Args.string({ required: false }),
  };

  async run(): Promise<void> {
    this.log(`${chalk.cyan('roleplay.sh')} - Test your AI agent before your users do.

Usage:
  roleplay init
  roleplay scenario:create <name>
  roleplay run <scenario>
  roleplay run social-engineering-core --target <url> --provider openai
  roleplay report latest|<runId> [--out .roleplay/runs]
  roleplay replay latest|<runId> [--out .roleplay/runs]
  roleplay upload latest|all --project <projectId>
  roleplay list scenarios|runs
  roleplay doctor
  roleplay mcp

Use --json on commands for machine-readable output.`);
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

const commandLoader: CommandLoader | undefined = command ? commands[command] : loadHelpCommand;
if (!commandLoader) {
  process.stderr.write(`Unknown command: ${command}\nRun roleplay --help.\n`);
  process.exit(2);
}

const CommandClass = await commandLoader();
await CommandClass.run(command && commands[command] ? rest : argv, import.meta.url);
