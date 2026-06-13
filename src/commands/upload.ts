import { Args, Flags } from '@oclif/core';
import chalk from 'chalk';
import {
  buildUploadPayload,
  requireUploadApiKey,
  requireUploadProjectId,
  uploadToCloud,
  verifyCloudCredentials,
} from '../cloud/upload-client.js';
import { AppError } from '../core/errors.js';
import { listRunIds, resolveRunDir } from '../core/run-store.js';
import { createSpinner } from '../utils/output.js';
import { BaseCommand } from './base.js';

export class UploadCommand extends BaseCommand {
  static description = 'Upload one run or all local runs to roleplay.sh cloud workbench.';
  static args = {
    run: Args.string({ required: false, default: 'latest' }),
  };
  static flags = {
    endpoint: Flags.string({
      description: 'cloud workbench URL.',
      default: process.env.ROLEPLAY_CLOUD_URL ?? 'http://127.0.0.1:3000',
    }),
    project: Flags.string({
      description: 'cloud workbench project ID.',
      default: process.env.ROLEPLAY_PROJECT_ID,
    }),
    'api-key': Flags.string({
      description: 'cloud workbench API key. Defaults to ROLEPLAY_API_KEY.',
      default: process.env.ROLEPLAY_API_KEY,
    }),
    mode: Flags.string({
      options: ['sanitized_findings', 'full_transcript_opt_in'],
      default: 'sanitized_findings',
      description: 'Upload sanitized findings by default, or opt into full transcript upload.',
    }),
    source: Flags.string({ options: ['ci', 'local', 'scheduled'], default: 'local' }),
    branch: Flags.string({ default: process.env.GITHUB_REF_NAME ?? process.env.BRANCH_NAME }),
    commit: Flags.string({ default: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA }),
    'build-url': Flags.string({
      description: 'CI build URL. Defaults to common CI environment variables.',
      default: defaultBuildUrl(),
    }),
    environment: Flags.string({ default: process.env.ROLEPLAY_ENVIRONMENT ?? process.env.NODE_ENV }),
    agent: Flags.string({
      description: 'Target agent name for Cloud attribution. Defaults to ROLEPLAY_AGENT_NAME.',
      default: process.env.ROLEPLAY_AGENT_NAME,
    }),
    out: Flags.string({ default: '.roleplay/runs' }),
    json: Flags.boolean({ description: 'Output JSON only.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(UploadCommand);
    const apiKey = requireUploadApiKey(flags['api-key']);
    const projectId = requireUploadProjectId(flags.project);
    const mode = flags.mode as 'sanitized_findings' | 'full_transcript_opt_in';
    const source = flags.source as 'ci' | 'local' | 'scheduled';
    const spinner = createSpinner(
      mode === 'full_transcript_opt_in' ? 'Uploading full transcript evidence' : 'Uploading sanitized findings',
      flags.json,
    );

    try {
      const runIds = await selectedUploadRunIds(args.run, flags.out);
      await assertUploadPolicyAllowsMode({
        endpoint: flags.endpoint,
        projectId,
        apiKey,
        mode,
      });

      if (args.run === 'all') {
        const uploads = [];
        for (const runId of runIds) {
          const payload = await buildUploadPayload({
            run: runId,
            runsDir: flags.out,
            projectId,
            mode,
            source,
            branch: flags.branch,
            commit: flags.commit,
            buildUrl: flags['build-url'],
            environment: flags.environment,
            targetAgent: flags.agent,
          });
          uploads.push(
            await uploadToCloud({
              endpoint: flags.endpoint,
              apiKey,
              payload,
            }),
          );
        }

        spinner?.succeed('Upload complete');

        const result = {
          projectId,
          uploaded: uploads.length,
          findingsUploaded: uploads.reduce((total, upload) => total + upload.findingsUploaded, 0),
          mode,
          uploads,
        };

        if (flags.json) {
          this.log(JSON.stringify(result));
          return;
        }

        this.log(`${chalk.cyan('roleplay.sh cloud workbench')}

Project: ${result.projectId}
Runs uploaded: ${result.uploaded}
Findings uploaded: ${result.findingsUploaded}
Mode: ${result.mode}`);
        return;
      }

      const runId = runIds[0] ?? args.run;
      const payload = await buildUploadPayload({
        run: runId,
        runsDir: flags.out,
        projectId,
        mode,
        source,
        branch: flags.branch,
        commit: flags.commit,
        buildUrl: flags['build-url'],
        environment: flags.environment,
        targetAgent: flags.agent,
      });
      const result = await uploadToCloud({
        endpoint: flags.endpoint,
        apiKey,
        payload,
      });
      spinner?.succeed('Upload complete');

      if (flags.json) {
        this.log(JSON.stringify(result));
        return;
      }

      this.log(`${chalk.cyan('roleplay.sh cloud workbench')}

Project: ${result.projectId}
Run: ${result.runId}
Findings uploaded: ${result.findingsUploaded}
Mode: ${result.mode}
${result.runUrl ? `URL: ${result.runUrl}` : ''}`);
    } catch (error) {
      spinner?.fail('Upload failed');
      throw error;
    }
  }
}

async function selectedUploadRunIds(run: string, runsDir: string): Promise<string[]> {
  if (run === 'all') {
    const runIds = await listRunIds(runsDir);
    if (runIds.length === 0) {
      throw new AppError({
        code: 'RUN_NOT_FOUND',
        message: `No runs were found in ${runsDir}.`,
        suggestion: 'Run an attack pack or scenario before uploading, or pass --out to the correct runs directory.',
        exitCode: 1,
      });
    }
    return runIds;
  }

  if (run === 'latest') {
    const runIds = await listRunIds(runsDir);
    if (!runIds[0]) {
      throw new AppError({
        code: 'RUN_NOT_FOUND',
        message: 'No roleplay runs found.',
        suggestion: 'Run a scenario first with roleplay run <scenario>.',
        exitCode: 2,
      });
    }
    return [runIds[0]];
  }

  await resolveRunDir(run, runsDir);
  return [run];
}

async function assertUploadPolicyAllowsMode(input: {
  endpoint: string;
  projectId: string;
  apiKey: string;
  mode: 'sanitized_findings' | 'full_transcript_opt_in';
}) {
  if (input.mode !== 'full_transcript_opt_in') return;
  const verification = await verifyCloudCredentials({
    endpoint: input.endpoint,
    projectId: input.projectId,
    apiKey: input.apiKey,
  });
  if (
    verification.uploadPolicy.mode === 'full_transcript_opt_in' &&
    verification.uploadPolicy.transcriptUpload
  ) {
    return;
  }

  throw new AppError({
    code: 'UPLOAD_FULL_TRANSCRIPT_DISABLED',
    message: `Full transcript upload is disabled for project ${input.projectId}.`,
    suggestion: 'Enable full transcript upload in CI & Uploads before sending full evidence, or use --mode sanitized_findings.',
    exitCode: 1,
  });
}

function defaultBuildUrl() {
  if (process.env.ROLEPLAY_BUILD_URL) return process.env.ROLEPLAY_BUILD_URL;
  if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  }
  return process.env.CI_JOB_URL ?? process.env.CIRCLE_BUILD_URL ?? process.env.BUILD_URL;
}
