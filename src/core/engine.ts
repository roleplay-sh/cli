import type { Report } from '../schemas/report.schema.js';
import { loadScenarioFile, type Scenario } from '../schemas/scenario.schema.js';
import type { Transcript } from '../schemas/transcript.schema.js';
import { createJudge } from '../providers/judge/index.js';
import type { JudgeMode } from '../providers/judge/index.js';
import { createUserSimulator } from '../providers/user-simulator/index.js';
import { createTargetAgent } from '../targets/index.js';
import { createRunPaths, resolveScenarioPath, saveRun, type RunPaths } from './run-store.js';
import { addTurn, createTranscript, finishTranscript } from './transcript.js';
import { generateMarkdownReport } from './reporter.js';
import { publicErrorMessage, publicErrorSupportCta, toAppError } from './errors.js';
import type { LlmProviderName } from '../providers/llm/client.js';

export interface RunOptions {
  scenarioRef: string;
  maxTurns?: number;
  outDir?: string;
  yes?: boolean;
  metadata?: Record<string, unknown>;
  attackerProvider?: LlmProviderName;
  judgeProvider?: LlmProviderName;
  judgeMode?: JudgeMode;
  attackerModel?: string;
  judgeModel?: string;
  llmBaseUrl?: string;
}

export interface RunResult {
  runId: string;
  scenario: Scenario;
  transcript: Transcript;
  report: Report;
  paths: RunPaths;
}

export async function runScenario(options: RunOptions): Promise<RunResult> {
  const scenarioPath = await resolveScenarioPath(options.scenarioRef);
  const scenario = await loadScenarioFile(scenarioPath);
  const maxTurns = options.maxTurns ?? scenario.simulation.maxTurns;
  const paths = await createRunPaths(options.outDir);
  const transcript = createTranscript(paths.runId, scenario.name);
  const defaultProvider: LlmProviderName | undefined = scenario.target.type === 'mock' ? 'mock' : undefined;
  const scenarioJudgeProvider = scenario.judge.type === 'mock' ? defaultProvider : scenario.judge.type;
  const scenarioAttackerProvider = scenario.attacker?.provider ?? scenarioJudgeProvider;
  const attackerProvider = options.attackerProvider ?? scenarioAttackerProvider;
  const judgeProvider = options.judgeProvider ?? scenarioJudgeProvider;
  const userSimulator = createUserSimulator({
    provider: attackerProvider,
    model: options.attackerModel ?? scenario.attacker?.model,
    baseUrl: options.llmBaseUrl ?? scenario.attacker?.baseUrl,
  });
  const target = createTargetAgent(scenario.target, { allowCliExecution: options.yes });
  const judge = createJudge({
    mode: options.judgeMode,
    provider: judgeProvider,
    model: options.judgeModel ?? scenario.judge.model,
    baseUrl: options.llmBaseUrl ?? scenario.judge.baseUrl,
  });

  try {
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const user = await userSimulator.generate({
        scenario,
        transcript,
        turn,
        temperature: scenario.simulation.temperature,
        purpose: 'roleplayed-user',
      });
      const content = user.content.trim();
      if (!content || content === 'SCENARIO_COMPLETE') break;

      addTurn(transcript, { turn, role: 'user', content, raw: user.raw });
      const agent = await target.send({ message: content, sessionId: paths.runId, turn });
      addTurn(transcript, {
        turn,
        role: 'agent',
        content: agent.response,
        raw: agent.raw,
      });
    }

    finishTranscript(transcript);
    const report = await judge.judge({ runId: paths.runId, scenario, transcript });
    const markdown = generateMarkdownReport(report, transcript);
    await saveRun({ scenario, transcript, report, markdown, paths, metadata: options.metadata });

    return { runId: paths.runId, scenario, transcript, report, paths };
  } catch (error) {
    const appError = toAppError(error);
    finishTranscript(transcript);
    const report: Report = {
      runId: paths.runId,
      scenario: scenario.name,
      status: 'failed',
      score: 0,
      summary: `${publicErrorMessage} Reference: ${appError.reference}`,
      criteria: [],
      failures: [
        {
          type: appError.code.toLowerCase(),
          severity: appError.exitCode === 4 ? 'high' : 'medium',
          message: `${publicErrorMessage} Reference: ${appError.reference}`,
        },
      ],
      recommendations: [publicErrorSupportCta],
      startedAt: transcript.startedAt,
      endedAt: transcript.endedAt ?? new Date().toISOString(),
      judgeMetadata: {
        mode: options.judgeMode ?? (judgeProvider && judgeProvider !== 'mock' ? 'semantic' : 'rules'),
        provider: judgeProvider,
        model: options.judgeModel ?? scenario.judge.model,
        rulesApplied: options.judgeMode !== 'semantic',
        deterministicFindingsAdded: 0,
      },
      rawJudgeOutput: appError.toJSON(),
    };
    const markdown = generateMarkdownReport(report, transcript);
    await saveRun({ scenario, transcript, report, markdown, paths, metadata: options.metadata });
    throw appError;
  }
}
