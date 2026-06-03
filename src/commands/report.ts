import { Args, Flags } from '@oclif/core';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { BaseCommand } from './base.js';
import { resolveRunDir } from '../core/run-store.js';
import { terminalSummary } from '../core/reporter.js';
import type { Report } from '../schemas/report.schema.js';

export class ReportCommand extends BaseCommand {
  static description = 'Show a saved report.';
  static args = {
    run: Args.string({ required: true }),
  };
  static flags = {
    json: Flags.boolean({ description: 'Print report JSON.' }),
    markdown: Flags.boolean({ description: 'Print report Markdown.' }),
    out: Flags.string({ default: '.roleplay/runs', description: 'Runs directory.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ReportCommand);
    const runDir = await resolveRunDir(args.run, flags.out);
    const reportJson = join(runDir, 'report.json');
    const reportMd = join(runDir, 'report.md');

    if (flags.markdown) {
      this.log(await fs.readFile(reportMd, 'utf8'));
      return;
    }

    const report = JSON.parse(await fs.readFile(reportJson, 'utf8')) as Report;
    if (flags.json) this.log(JSON.stringify(report));
    else this.log(terminalSummary({ report, reportPath: reportJson, markdownPath: reportMd }));
  }
}
