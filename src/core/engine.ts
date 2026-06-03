import type { Report } from '../schemas/report.schema.js';
import { loadScenarioFile, type Scenario } from '../schemas/scenario.schema.js';
import type { Transcript } from '../schemas/transcript.schema.js';
import { createJudge } from '../providers/judge/index.js';
import { createLlmProvider } from '../providers/llm/index.js';
import { createTargetAgent } from '../targets/index.js';
import { createRunPaths, resolveScenarioPath, saveRun, type RunPaths } from './run-store.js';
import { addTurn, createTranscript, finishTranscript } from './transcript.js';
import { generateMarkdownReport } from './reporter.js';
import { toAppError } from './errors.js';

export interface RunOptions {
  scenarioRef: string;
  provider: 'openai' | 'mock';
  judge: 'openai' | 'mock';
  model?: string;
  maxTurns?: number;
  outDir?: string;
  yes?: boolean;
  metadata?: Record<string, unknown>;
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
  const llm = createLlmProvider(options.provider, options.model);
  const target = createTargetAgent(scenario.target, { allowCliExecution: options.yes });
  const judge = createJudge(options.judge, options.model ?? scenario.judge.model);

  try {
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const user = await llm.generate({
        scenario,
        transcript,
        turn,
        model: options.model,
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
    const report = await judge.judge({ runId: paths.runId, scenario, transcript, model: options.model });
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
      summary: `Run failed before evaluation completed: ${appError.message}`,
      criteria: [],
      failures: [
        {
          type: appError.code.toLowerCase(),
          severity: appError.exitCode === 4 ? 'high' : 'medium',
          message: appError.message,
        },
      ],
      recommendations: [
        appError.suggestion ?? 'Inspect the saved transcript and target/provider configuration.',
      ],
      startedAt: transcript.startedAt,
      endedAt: transcript.endedAt ?? new Date().toISOString(),
      rawJudgeOutput: appError.toJSON(),
    };
    const markdown = generateMarkdownReport(report, transcript);
    await saveRun({ scenario, transcript, report, markdown, paths, metadata: options.metadata });
    throw appError;
  }
}
