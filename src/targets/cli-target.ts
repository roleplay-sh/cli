import { execa } from 'execa';
import { AppError } from '../core/errors.js';
import type { Scenario } from '../schemas/scenario.schema.js';
import type { TargetAgent, TargetInput, TargetOutput } from './index.js';

type CliConfig = Extract<Scenario['target'], { type: 'cli' }>;

export class CliTarget implements TargetAgent {
  constructor(
    private readonly config: CliConfig,
    private readonly allowExecution: boolean,
  ) {}

  async send(input: TargetInput): Promise<TargetOutput> {
    if (!this.allowExecution) {
      throw new AppError({
        code: 'CLI_TARGET_CONFIRMATION_REQUIRED',
        message: `Scenario wants to execute local command: ${this.config.command}. Re-run with --yes after reviewing it.`,
        suggestion: 'Re-run with --yes after reviewing the scenario command.',
        exitCode: 3,
      });
    }

    const commandParts = parseCommand(this.config.command);
    const executable = this.config.shell ? this.config.command : commandParts.command;
    const args = this.config.shell
      ? this.config.mode === 'arg'
        ? [input.message]
        : []
      : [...commandParts.args, ...(this.config.mode === 'arg' ? [input.message] : [])];
    try {
      const result = await execa(executable, args, {
        shell: this.config.shell,
        input: this.config.mode === 'stdin' ? input.message : undefined,
        timeout: this.config.timeoutMs,
        reject: false,
      });
      if (result.exitCode !== 0) {
        throw new AppError({
          code: 'CLI_TARGET_FAILED',
          message: `CLI target exited with code ${result.exitCode}.`,
          suggestion: 'Run the command manually to debug stderr.',
          exitCode: 3,
          cause: result,
        });
      }
      return {
        response: result.stdout.trim(),
        raw: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError({
        code: error instanceof Error && error.name === 'TimeoutError' ? 'CLI_TARGET_TIMEOUT' : 'CLI_TARGET_ERROR',
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'Check target.command and command timeout.',
        exitCode: 3,
        cause: error,
      });
    }
  }
}

function parseCommand(command: string): { command: string; args: string[] } {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const [executable, ...args] = parts.map((part) => part.replace(/^(['"])(.*)\1$/, '$2'));
  if (!executable) {
    throw new AppError({
      code: 'CLI_TARGET_INVALID_COMMAND',
      message: 'CLI target command is empty.',
      suggestion: 'Set target.command to an executable and optional arguments.',
      exitCode: 3,
    });
  }
  return { command: executable, args };
}
