import { Args, Flags } from '@oclif/core';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScenario } from '../core/engine.js';
import { resolveScenarioPath } from '../core/run-store.js';
import { loadScenarioFile, type Scenario } from '../schemas/scenario.schema.js';
import { shouldFail } from '../core/scoring.js';
import { terminalSummary } from '../core/reporter.js';
import { createSpinner } from '../utils/output.js';
import { ensureDir } from '../utils/fs.js';
import { builtInAttackPackNames, smokeAttackPackTemplates } from '../templates/scenarios.js';
import { AppError } from '../core/errors.js';
import { BaseCommand } from './base.js';
import { normalizeProvider, type LlmProviderName } from '../providers/llm/client.js';
import { assertRunEntitlement, fetchAttackPackBundle, requireRunApiKey, requireRunProjectId } from '../cloud/upload-client.js';
import type { JudgeMode } from '../providers/judge/index.js';

const builtInAttackPackSet = new Set<string>(builtInAttackPackNames);

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
      description: 'Shared attacker and judge provider. Defaults to ROLEPLAY_LLM_PROVIDER. Required for real targets.',
      default: process.env.ROLEPLAY_LLM_PROVIDER,
    }),
    'attacker-provider': Flags.string({
      options: ['mock', 'openai', 'anthropic', 'google', 'openai-compatible'],
      description: 'Provider for adaptive attacker turns. Defaults to ROLEPLAY_ATTACKER_PROVIDER or --provider.',
      default: process.env.ROLEPLAY_ATTACKER_PROVIDER,
    }),
    'judge-provider': Flags.string({
      options: ['mock', 'openai', 'anthropic', 'google', 'openai-compatible'],
      description: 'Provider for semantic or hybrid judging. Defaults to ROLEPLAY_JUDGE_PROVIDER or --provider.',
      default: process.env.ROLEPLAY_JUDGE_PROVIDER,
    }),
    judge: Flags.string({
      options: ['rules', 'semantic', 'hybrid'],
      description: 'Judge mode: rules for deterministic checks, semantic for provider-backed evaluation, hybrid for both.',
      default: process.env.ROLEPLAY_JUDGE_MODE,
    }),
    'allow-rules-only': Flags.boolean({
      description: 'Allow deterministic rules-only judging for a real target.',
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
    endpoint: Flags.string({
      description: 'workbench URL for real-run entitlement checks. Defaults to ROLEPLAY_CLOUD_URL.',
      default: process.env.ROLEPLAY_CLOUD_URL ?? 'http://127.0.0.1:3000',
    }),
    project: Flags.string({
      description: 'workbench project ID for real agent tests. Defaults to ROLEPLAY_PROJECT_ID.',
      default: process.env.ROLEPLAY_PROJECT_ID,
    }),
    'api-key': Flags.string({
      description: 'workbench API key for real agent tests. Defaults to ROLEPLAY_API_KEY.',
      default: process.env.ROLEPLAY_API_KEY,
    }),
    yes: Flags.boolean({ char: 'y', description: 'Allow local CLI target command execution.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RunCommand);
    if (builtInAttackPackSet.has(args.scenario)) {
      await this.runBuiltInAttackPack(args.scenario, flags);
      return;
    }

    if (flags.target || flags['target-command']) {
      throw new AppError({
        code: 'ATTACK_PACK_TARGET_UNSUPPORTED',
        message: '--target and --target-command are only supported when running built-in attack packs.',
        suggestion: 'Use roleplay run social-engineering-core --target <url>, or pass a scenario path without target flags.',
        exitCode: 2,
      });
    }

    const scenario = await loadScenarioFile(await resolveScenarioPath(args.scenario));
    const providers = resolveProviderFlags(flags);
    const judgeMode = resolveJudgeMode(flags.judge);
    if (scenarioRequiresRunEntitlement(scenario, providers)) {
      const effectiveProviders = providersForScenario(scenario, providers);
      assertRealRunConfiguration({
        targetKind: scenario.target.type,
        providers: effectiveProviders,
        judgeMode,
        allowRulesOnly: flags['allow-rules-only'],
      });
      const projectId = requireRunProjectId(flags.project);
      const apiKey = requireRunApiKey(flags['api-key']);
      await assertRunEntitlement({
        endpoint: flags.endpoint,
        projectId,
        apiKey,
      });
    }
    const spinner = createSpinner('Running scenario', flags.json);
    let result;
    try {
      result = await runScenario({
        scenarioRef: args.scenario,
        maxTurns: flags['max-turns'],
        outDir: flags.out,
        yes: flags.yes,
        judgeMode,
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

  private async runBuiltInAttackPack(packName: string, flags: {
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
    judge?: string;
    'allow-rules-only'?: boolean;
    model?: string;
    'attacker-model'?: string;
    'judge-model'?: string;
    'llm-base-url'?: string;
    endpoint: string;
    project?: string;
    'api-key'?: string;
  }): Promise<void> {
    if (Boolean(flags.target) === Boolean(flags['target-command'])) {
      throw new AppError({
        code: 'ATTACK_PACK_TARGET_REQUIRED',
        message: `Provide exactly one target for ${packName}.`,
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
    const scenarioDir = await fs.mkdtemp(join(tmpdir(), `roleplay-${packName}-`));
    await ensureDir(scenarioDir);
    const providers = resolveProviderFlags(flags, target.type === 'mock' ? 'mock' : undefined);
    const judgeMode = resolveJudgeMode(flags.judge, target.type === 'mock' ? 'rules' : undefined);
    if (target.type !== 'mock' || providersContainRealProvider(providers)) {
      assertRealRunConfiguration({
        targetKind: target.type,
        providers,
        judgeMode,
        allowRulesOnly: flags['allow-rules-only'],
      });
      await assertRunEntitlement({
        endpoint: flags.endpoint,
        projectId: requireRunProjectId(flags.project),
        apiKey: requireRunApiKey(flags['api-key']),
      });
    }
    const spinner = createSpinner(`Running ${packName}`, flags.json);

    try {
      const scenarioFiles = target.type === 'mock' && !providersContainRealProvider(providers)
        ? await writeLocalSmokePack(scenarioDir, target)
        : await writePrivateAttackPackBundle({
            scenarioDir,
            endpoint: flags.endpoint,
            projectId: requireRunProjectId(flags.project),
            apiKey: requireRunApiKey(flags['api-key']),
            packId: packName,
            target,
            judgeMode,
          });

      const results = [];
      for (const item of scenarioFiles) {
        const result = await runScenario({
          scenarioRef: item.path,
          maxTurns: flags['max-turns'],
          outDir: flags.out,
          yes: flags.yes,
          judgeMode,
          ...providers,
          metadata: item.metadata,
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
            pack: packName,
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
  judge?: string;
  'allow-rules-only'?: boolean;
  model?: string;
  'attacker-model'?: string;
  'judge-model'?: string;
  'llm-base-url'?: string;
  endpoint?: string;
  project?: string;
  'api-key'?: string;
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

function resolveJudgeMode(value: string | undefined, fallback?: JudgeMode): JudgeMode | undefined {
  const raw = value ?? process.env.ROLEPLAY_JUDGE_MODE;
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'rules' || normalized === 'semantic' || normalized === 'hybrid') return normalized;
  throw new AppError({
    code: 'JUDGE_MODE_UNSUPPORTED',
    message: `Unsupported judge mode "${value}".`,
    suggestion: 'Use --judge rules, --judge semantic, or --judge hybrid.',
    exitCode: 2,
  });
}

function assertRealRunConfiguration(input: {
  targetKind: 'http' | 'cli' | 'mock';
  providers: { attackerProvider?: LlmProviderName; judgeProvider?: LlmProviderName };
  judgeMode?: JudgeMode;
  allowRulesOnly?: boolean;
}) {
  const usesRealProvider = providersContainRealProvider(input.providers);
  if (input.targetKind === 'mock' && !usesRealProvider) return;
  if (input.targetKind !== 'mock' && (!input.providers.attackerProvider || input.providers.attackerProvider === 'mock')) {
    throw new AppError({
      code: 'ATTACKER_PROVIDER_REQUIRED',
      message: 'Choose an attacker provider before running real agent tests.',
      suggestion:
        'Set ROLEPLAY_LLM_PROVIDER=<provider> or pass --provider <provider>. Use --target mock --provider mock --judge rules for smoke tests.',
      exitCode: 2,
    });
  }

  if (!input.judgeMode) {
    throw new AppError({
      code: 'JUDGE_MODE_REQUIRED',
      message: 'Choose how roleplay.sh should judge this real agent test.',
      suggestion:
        'Pass --judge semantic for provider-backed judging, --judge hybrid for semantic plus deterministic guardrails, or --judge rules --allow-rules-only for deterministic-only evaluation.',
      exitCode: 2,
    });
  }

  if (input.judgeMode === 'rules' && !input.allowRulesOnly) {
    throw new AppError({
      code: 'JUDGE_RULES_ONLY_CONFIRMATION_REQUIRED',
      message: 'Rules-only judging is available for real targets only when explicitly confirmed.',
      suggestion:
        'Use --judge semantic or --judge hybrid for real tests, or add --allow-rules-only if deterministic-only evaluation is intentional.',
      exitCode: 2,
    });
  }

  if (
    (input.judgeMode === 'semantic' || input.judgeMode === 'hybrid') &&
    (!input.providers.judgeProvider || input.providers.judgeProvider === 'mock')
  ) {
    throw new AppError({
      code: 'JUDGE_PROVIDER_REQUIRED',
      message: 'Choose a judge provider for semantic or hybrid evaluation.',
      suggestion:
        'Set ROLEPLAY_JUDGE_PROVIDER=<provider>, pass --judge-provider <provider>, or use --provider <provider> for both attacker and judge.',
      exitCode: 2,
    });
  }
}

function scenarioRequiresRunEntitlement(
  scenario: Scenario,
  providers: { attackerProvider?: LlmProviderName; judgeProvider?: LlmProviderName },
): boolean {
  return (
    scenario.target.type !== 'mock' ||
    (scenario.attacker?.provider !== undefined && scenario.attacker.provider !== 'mock') ||
    scenario.judge.type !== 'mock' ||
    providersContainRealProvider(providers)
  );
}

function providersForScenario(
  scenario: Scenario,
  providers: { attackerProvider?: LlmProviderName; judgeProvider?: LlmProviderName },
) {
  return {
    attackerProvider: providers.attackerProvider ?? scenario.attacker?.provider,
    judgeProvider: providers.judgeProvider ?? (scenario.judge.type === 'mock' ? undefined : scenario.judge.type),
  };
}

function providersContainRealProvider(providers: { attackerProvider?: LlmProviderName; judgeProvider?: LlmProviderName }): boolean {
  return [providers.attackerProvider, providers.judgeProvider].some((provider) => provider !== undefined && provider !== 'mock');
}

async function writeLocalSmokePack(scenarioDir: string, target: { type: 'mock' }) {
  const files: Array<{ path: string; metadata: { attackPackId: string; attackPackScenario: string } }> = [];
  for (const content of smokeAttackPackTemplates(target)) {
    const name = content.match(/^name:\s*(.+)$/m)?.[1] ?? `social-engineering-smoke-${files.length + 1}`;
    const path = join(scenarioDir, `${safeScenarioFileName(name)}.yml`);
    await fs.writeFile(path, content, 'utf8');
    files.push({
      path,
      metadata: {
        attackPackId: 'pack_smoke',
        attackPackScenario: name,
      },
    });
  }
  return files;
}

async function writePrivateAttackPackBundle(input: {
  scenarioDir: string;
  endpoint: string;
  projectId: string;
  apiKey: string;
  packId: string;
  target: { type: 'mock' } | { type: 'http'; url: string } | { type: 'cli'; command: string };
  judgeMode?: JudgeMode;
}) {
  const bundle = await fetchAttackPackBundle(input);
  const files = [];
  for (const scenario of bundle.scenarios) {
    const path = join(input.scenarioDir, `${safeScenarioFileName(scenario.name || scenario.id)}.yml`);
    await fs.writeFile(path, scenario.yaml, 'utf8');
    files.push({ path, metadata: scenario.metadata });
  }
  return files;
}

function safeScenarioFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'scenario';
}
