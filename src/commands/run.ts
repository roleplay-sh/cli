import { Args, Flags } from '@oclif/core';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScenario } from '../core/engine.js';
import { shouldFail } from '../core/scoring.js';
import { terminalSummary } from '../core/reporter.js';
import { createSpinner } from '../utils/output.js';
import { ensureDir } from '../utils/fs.js';
import { attackPackTemplates } from '../templates/scenarios.js';
import { AppError } from '../core/errors.js';
import { BaseCommand } from './base.js';
import { normalizeProvider, type LlmProviderName } from '../providers/llm/client.js';

const socialEngineeringCorePack = 'social-engineering-core';

export class RunCommand extends BaseCommand {
  static description = 'Run a roleplay scenario or built-in attack pack.';
  static args = {
    scenario: Args.string({ required: true }),
  };
  static flags = {
    target: Flags.string({
      description: 'HTTP target URL, or "mock" for local smoke tests. Defaults to ROLEPLAY_TARGET_URL.',
      default: process.env.ROLEPLAY_TARGET_URL,
    }),
    'target-command': Flags.string({
      description: 'CLI target command for built-in attack packs. Defaults to ROLEPLAY_TARGET_COMMAND.',
      default: process.env.ROLEPLAY_TARGET_COMMAND,
    }),
    'max-turns': Flags.integer(),
    json: Flags.boolean({ description: 'Output JSON only.' }),
    out: Flags.string({ default: '.roleplay/runs' }),
    'fail-on': Flags.string({ options: ['warning', 'failed', 'critical'], default: 'failed' }),
    provider: Flags.string({
      options: ['mock', 'openai', 'anthropic', 'google', 'openai-compatible'],
      description: 'Shared attacker and judge provider. Defaults to ROLEPLAY_LLM_PROVIDER, openai for real attack-pack targets, or mock for smoke tests.',
      default: process.env.ROLEPLAY_LLM_PROVIDER,
    }),
    'attacker-provider': Flags.string({
      options: ['mock', 'openai', 'anthropic', 'google', 'openai-compatible'],
      description: 'Provider for adaptive attacker turns. Defaults to ROLEPLAY_ATTACKER_PROVIDER or --provider.',
      default: process.env.ROLEPLAY_ATTACKER_PROVIDER,
    }),
    'judge-provider': Flags.string({
      options: ['mock', 'openai', 'anthropic', 'google', 'openai-compatible'],
      description: 'Provider for transcript judging. Defaults to ROLEPLAY_JUDGE_PROVIDER or --provider.',
      default: process.env.ROLEPLAY_JUDGE_PROVIDER,
    }),
    model: Flags.string({
      description: 'Shared LLM model. Defaults to ROLEPLAY_LLM_MODEL or provider defaults.',
      default: process.env.ROLEPLAY_LLM_MODEL,
    }),
    'attacker-model': Flags.string({
      description: 'Model for adaptive attacker turns. Defaults to ROLEPLAY_ATTACKER_MODEL or --model.',
      default: process.env.ROLEPLAY_ATTACKER_MODEL,
    }),
    'judge-model': Flags.string({
      description: 'Model for transcript judging. Defaults to ROLEPLAY_JUDGE_MODEL, scenario judge.model, or --model.',
      default: process.env.ROLEPLAY_JUDGE_MODEL,
    }),
    'llm-base-url': Flags.string({
      description: 'Base URL for openai-compatible providers. Defaults to ROLEPLAY_LLM_BASE_URL.',
      default: process.env.ROLEPLAY_LLM_BASE_URL,
    }),
    yes: Flags.boolean({ char: 'y', description: 'Allow local CLI target command execution.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RunCommand);
    if (args.scenario === socialEngineeringCorePack) {
      await this.runSocialEngineeringCore(flags);
      return;
    }

    if (flags.target || flags['target-command']) {
      throw new AppError({
        code: 'ATTACK_PACK_TARGET_UNSUPPORTED',
        message: '--target and --target-command are only supported when running social-engineering-core.',
        suggestion: 'Use roleplay run social-engineering-core --target <url>, or pass a scenario path without target flags.',
        exitCode: 2,
      });
    }

    const spinner = createSpinner('Running scenario', flags.json);
    const providers = resolveProviderFlags(flags);
    let result;
    try {
      result = await runScenario({
        scenarioRef: args.scenario,
        maxTurns: flags['max-turns'],
        outDir: flags.out,
        yes: flags.yes,
        ...providers,
      });
      spinner?.succeed('Scenario complete');
    } catch (error) {
      spinner?.fail('Scenario failed');
      throw error;
    }

    if (flags.json) {
      this.log(
        JSON.stringify({
          runId: result.runId,
          scenario: result.scenario.name,
          status: result.report.status,
          score: result.report.score,
          reportPath: result.paths.reportJsonPath,
          markdownPath: result.paths.reportMarkdownPath,
        }),
      );
    } else {
      this.log(
        terminalSummary({
          report: result.report,
          reportPath: result.paths.reportJsonPath,
          markdownPath: result.paths.reportMarkdownPath,
        }),
      );
    }

    if (shouldFail(result.report.status, result.report.failures, flags['fail-on'] as any)) {
      process.exitCode = 1;
    }
  }

  private async runSocialEngineeringCore(flags: {
    target?: string;
    'target-command'?: string;
    'max-turns'?: number;
    json?: boolean;
    out: string;
    'fail-on': string;
    yes?: boolean;
    provider?: string;
    'attacker-provider'?: string;
    'judge-provider'?: string;
    model?: string;
    'attacker-model'?: string;
    'judge-model'?: string;
    'llm-base-url'?: string;
  }): Promise<void> {
    if (Boolean(flags.target) === Boolean(flags['target-command'])) {
      throw new AppError({
        code: 'ATTACK_PACK_TARGET_REQUIRED',
        message: 'Provide exactly one target for social-engineering-core.',
        suggestion:
          'Use --target http://localhost:3000/agent, --target-command "node ./agent.js", ROLEPLAY_TARGET_URL, or ROLEPLAY_TARGET_COMMAND.',
        exitCode: 2,
      });
    }

    const target = flags.target === 'mock'
      ? ({ type: 'mock' } as const)
      : flags.target
      ? ({ type: 'http', url: flags.target } as const)
      : ({ type: 'cli', command: flags['target-command'] as string } as const);
    const scenarioDir = await fs.mkdtemp(join(tmpdir(), 'roleplay-social-engineering-core-'));
    await ensureDir(scenarioDir);
    const spinner = createSpinner('Running social-engineering-core', flags.json);
    const providers = resolveProviderFlags(flags, target.type === 'mock' ? 'mock' : 'openai');

    try {
      const files: string[] = [];
      for (const content of attackPackTemplates(target)) {
        const name = content.match(/^name:\s*(.+)$/m)?.[1] ?? `social-engineering-${files.length + 1}`;
        const path = join(scenarioDir, `${name}.yml`);
        await fs.writeFile(path, content, 'utf8');
        files.push(path);
      }

      const results = [];
      for (const file of files) {
        const result = await runScenario({
          scenarioRef: file,
          maxTurns: flags['max-turns'],
          outDir: flags.out,
          yes: flags.yes,
          ...providers,
          metadata: {
            attackPackId: cloudAttackPackIdForScenario(resultNameFromPath(file)),
            attackPackScenario: resultNameFromPath(file),
          },
        });
        results.push({
          runId: result.runId,
          scenario: result.scenario.name,
          status: result.report.status,
          score: result.report.score,
          failures: result.report.failures,
          reportPath: result.paths.reportJsonPath,
          markdownPath: result.paths.reportMarkdownPath,
        });
      }

      spinner?.succeed('Attack pack complete');
      const failed = results.filter((result) =>
        shouldFail(result.status, result.failures, flags['fail-on'] as 'warning' | 'failed' | 'critical'),
      );

      if (flags.json) {
        this.log(
          JSON.stringify({
            pack: socialEngineeringCorePack,
            target: target.type,
            total: results.length,
            failed: failed.length,
            results,
          }),
        );
      } else {
        this.log(
          results
            .map((result) => `${result.status.toUpperCase()} ${result.score}/100 ${result.scenario} ${result.runId}`)
            .join('\n'),
        );
      }

      if (failed.length) process.exitCode = 1;
    } catch (error) {
      spinner?.fail('Attack pack failed');
      throw error;
    } finally {
      await fs.rm(scenarioDir, { recursive: true, force: true });
    }
  }
}

function resolveProviderFlags(flags: {
  provider?: string;
  'attacker-provider'?: string;
  'judge-provider'?: string;
  model?: string;
  'attacker-model'?: string;
  'judge-model'?: string;
  'llm-base-url'?: string;
}, fallback?: LlmProviderName): {
  attackerProvider?: LlmProviderName;
  judgeProvider?: LlmProviderName;
  attackerModel?: string;
  judgeModel?: string;
  llmBaseUrl?: string;
} {
  const sharedProvider = providerFrom(flags.provider ?? process.env.ROLEPLAY_LLM_PROVIDER, fallback);
  const attackerProvider = providerFrom(flags['attacker-provider'] ?? process.env.ROLEPLAY_ATTACKER_PROVIDER, sharedProvider);
  const judgeProvider = providerFrom(flags['judge-provider'] ?? process.env.ROLEPLAY_JUDGE_PROVIDER, sharedProvider);
  return {
    attackerProvider,
    judgeProvider,
    attackerModel: flags['attacker-model'] ?? process.env.ROLEPLAY_ATTACKER_MODEL ?? flags.model ?? process.env.ROLEPLAY_LLM_MODEL,
    judgeModel: flags['judge-model'] ?? process.env.ROLEPLAY_JUDGE_MODEL ?? flags.model ?? process.env.ROLEPLAY_LLM_MODEL,
    llmBaseUrl: flags['llm-base-url'] ?? process.env.ROLEPLAY_LLM_BASE_URL,
  };
}

function providerFrom(value: string | undefined, fallback: LlmProviderName | undefined): LlmProviderName | undefined {
  if (!value && !fallback) return undefined;
  return normalizeProvider(value, fallback ?? 'mock');
}

function resultNameFromPath(path: string) {
  return path.replace(/^.*[\\/]/, '').replace(/\.ya?ml$/i, '');
}

function cloudAttackPackIdForScenario(scenarioName: string) {
  if (scenarioName.includes('authority-impersonation')) return 'pack_authority';
  if (scenarioName.includes('urgency-pressure')) return 'pack_urgency';
  if (scenarioName.includes('policy-bypass')) return 'pack_policy';
  if (scenarioName.includes('indirect-prompt-injection')) return 'pack_injection';
  if (scenarioName.includes('data-exfiltration')) return 'pack_exfiltration';
  if (scenarioName.includes('tool-misuse')) return 'pack_tools';
  if (scenarioName.includes('auth-session-confusion')) return 'pack_auth_session';
  if (scenarioName.includes('memory-context-poisoning')) return 'pack_memory_context';
  return undefined;
}
