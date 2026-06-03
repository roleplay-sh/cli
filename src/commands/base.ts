import { Command } from '@oclif/core';
import { toAppError } from '../core/errors.js';
import { loadEnv } from '../utils/env.js';
import { printError } from '../utils/output.js';

export abstract class BaseCommand extends Command {
  protected async init(): Promise<void> {
    await super.init();
    loadEnv();
  }

  protected async catch(error: Error & { exitCode?: number }): Promise<unknown> {
    const appError = toAppError(error);
    const json = this.argv.includes('--json');
    printError(appError, json);
    process.exit(appError.exitCode);
  }
}
