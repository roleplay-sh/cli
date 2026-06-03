#!/usr/bin/env node
import { Args, Command } from '@oclif/core';
import chalk from 'chalk';
import { DoctorCommand } from './commands/doctor.js';
import { InitCommand } from './commands/init.js';
import { ListCommand } from './commands/list.js';
import { McpCommand } from './commands/mcp.js';
import { RedteamCommand } from './commands/redteam.js';
import { ReplayCommand } from './commands/replay.js';
import { ReportCommand } from './commands/report.js';
import { RunCommand } from './commands/run.js';
import { UploadCommand } from './commands/upload.js';
import { ScenarioCreateCommand } from './commands/scenario/create.js';

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
  roleplay run <scenario> [--provider mock|openai] [--judge mock|openai]
  ROLEPLAY_TARGET_URL=<url> roleplay run social-engineering-core
  roleplay report latest|<runId> [--out .roleplay/runs]
  roleplay replay latest|<runId> [--out .roleplay/runs]
  roleplay upload latest|all --project <projectId>
  roleplay list scenarios|runs
  roleplay doctor
  roleplay redteam --target <url>

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

const commands: Record<string, RunnableCommand> = {
  init: InitCommand,
  'scenario:create': ScenarioCreateCommand,
  run: RunCommand,
  upload: UploadCommand,
  report: ReportCommand,
  replay: ReplayCommand,
  list: ListCommand,
  doctor: DoctorCommand,
  redteam: RedteamCommand,
  mcp: McpCommand,
  help: HelpCommand,
  '--help': HelpCommand,
  '-h': HelpCommand,
};

const CommandClass: RunnableCommand | undefined = command ? commands[command] : HelpCommand;
if (!CommandClass) {
  process.stderr.write(`Unknown command: ${command}\nRun roleplay --help.\n`);
  process.exit(2);
}

await CommandClass.run(command && commands[command] ? rest : argv, import.meta.url);
