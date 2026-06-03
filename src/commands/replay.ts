import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { BaseCommand } from './base.js';
import { resolveRunDir } from '../core/run-store.js';
import type { Transcript } from '../schemas/transcript.schema.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ReplayCommand extends BaseCommand {
  static description = 'Replay a saved transcript.';
  static args = {
    run: Args.string({ required: true }),
  };
  static flags = {
    speed: Flags.integer({ default: 1 }),
    'no-delay': Flags.boolean({ description: 'Replay without delay.' }),
    json: Flags.boolean({ description: 'Print transcript JSON.' }),
    out: Flags.string({ default: '.roleplay/runs', description: 'Runs directory.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ReplayCommand);
    const runDir = await resolveRunDir(args.run, flags.out);
    const transcript = JSON.parse(
      await fs.readFile(join(runDir, 'transcript.json'), 'utf8'),
    ) as Transcript;

    if (flags.json) {
      this.log(JSON.stringify(transcript));
      return;
    }

    this.log(chalk.cyan(`roleplay.sh replay ${transcript.runId}`));
    for (const turn of transcript.turns) {
      const label = turn.role === 'user' ? chalk.cyan('USER') : chalk.green('AGENT');
      this.log(`\n${label} ${turn.turn}`);
      this.log(turn.content);
      if (!flags['no-delay']) await wait(Math.max(100, 700 / flags.speed));
    }
  }
}
