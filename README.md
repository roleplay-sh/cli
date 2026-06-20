# roleplay.sh CLI

Included local runner for roleplay.sh social-engineering tests.

`roleplay` runs Workbench attack packs against your local, HTTP, CLI, or mock AI agent target, saves replayable evidence, and uploads sanitized proof to the roleplay.sh Workbench.

## Install

```bash
npm install -g @roleplay-sh/cli
```

Or run without installing:

```bash
npx @roleplay-sh/cli --help
```

## Smoke Test Only

Use mock mode to confirm the CLI is installed and can save local evidence. This does not test a real agent.

```bash
roleplay init
roleplay run social-engineering-core --target mock --provider mock --judge rules --fail-on critical
roleplay report latest
roleplay replay latest
```

## Run A Real Local Test

Create a Builder or Team workspace in the roleplay.sh Workbench, create a project API key, choose your provider, choose how results should be judged, then run the included local runner against your agent. Real attack-pack scenarios are fetched from the Workbench for entitled projects; they are not bundled in the public CLI package.

HTTP target:

```bash
roleplay run social-engineering-core \
  --target http://localhost:3000/agent \
  --provider <provider> \
  --judge hybrid \
  --project <project-id> \
  --api-key <project-api-key> \
  --fail-on critical
```

CLI target:

```bash
roleplay run social-engineering-core \
  --target-command "node ./agent.js" \
  --provider <provider> \
  --judge hybrid \
  --project <project-id> \
  --api-key <project-api-key> \
  --fail-on critical \
  --yes
```

## Judge Choices

- `--judge rules`: deterministic local rule judge. Best for smoke tests and offline checks.
- `--judge semantic`: provider-backed security judge for real agent tests.
- `--judge hybrid`: semantic judge plus deterministic guardrails. Recommended for CI once your provider is configured.

Rules-only judging can be used against real targets only with `--allow-rules-only`, so it is never mistaken for full semantic evaluation.

## Provider Configuration

roleplay.sh is provider-neutral. Pick the provider you want to use for adaptive attacker turns and semantic judging.

```bash
export ROLEPLAY_PROJECT_ID="<project-id>"
export ROLEPLAY_API_KEY="<project-api-key>"
export ROLEPLAY_LLM_PROVIDER="<provider>"
export ROLEPLAY_JUDGE_MODE="hybrid"
export ROLEPLAY_JUDGE_PROVIDER="<provider>"
export ROLEPLAY_<PROVIDER>_API_KEY="your-provider-key"
```

Supported provider identifiers: `openai`, `anthropic`, `google`, and `openai-compatible`.

Use `--attacker-provider` and `--judge-provider` when you want different providers for attacker turns and transcript judging.

## Guided Setup

```bash
roleplay setup
roleplay doctor --cloud
```

`roleplay setup` writes safe placeholders to `.env.example`. It does not store raw provider or Workbench API keys by default.

## Upload Sanitized Proof

```bash
ROLEPLAY_CLOUD_URL=https://app.roleplay.sh \
ROLEPLAY_PROJECT_ID=<project-id> \
ROLEPLAY_API_KEY=<project-api-key> \
roleplay upload all --mode sanitized_findings --source ci
```

Sanitized upload is the default. Full transcripts, raw scenario YAML, and local metadata stay in your environment unless full transcript upload is explicitly enabled by project policy and CLI mode.

## Workbench Loop

The CLI is the local execution engine inside the workbench workflow:

```text
choose plan -> create project -> configure provider and judge -> fetch and run a social-engineering pack locally -> upload sanitized proof -> review evidence -> verify the fix -> monitor or gate regressions
```

Workbench attack packs preserve stable regression keys and business-boundary metadata so findings can be grouped by agent role, external actor, failed boundary, action risk, and data sensitivity.

## Commands

- `roleplay setup` guides Workbench and local runner setup.
- `roleplay init` creates local config and a smoke-test scenario.
- `roleplay run` runs a scenario file or fetches an entitled Workbench attack pack.
- `roleplay report` prints a saved run report.
- `roleplay replay` replays transcript evidence.
- `roleplay upload` uploads sanitized findings to the Workbench.
- `roleplay list` lists local runs.
- `roleplay doctor` checks install, Workbench, provider, judge, and upload readiness.
- `roleplay mcp` exposes roleplay.sh through MCP.

## CI Example

```yaml
- name: Run roleplay.sh attack pack
  run: pnpm dlx @roleplay-sh/cli run social-engineering-core --judge hybrid --fail-on critical
  env:
    ROLEPLAY_TARGET_URL: ${{ secrets.ROLEPLAY_TARGET_URL }}
    ROLEPLAY_PROJECT_ID: ${{ secrets.ROLEPLAY_PROJECT_ID }}
    ROLEPLAY_API_KEY: ${{ secrets.ROLEPLAY_API_KEY }}
    ROLEPLAY_LLM_PROVIDER: ${{ secrets.ROLEPLAY_LLM_PROVIDER }}
    ROLEPLAY_JUDGE_MODE: hybrid
    ROLEPLAY_JUDGE_PROVIDER: ${{ secrets.ROLEPLAY_JUDGE_PROVIDER }}
    ROLEPLAY_LLM_API_KEY: ${{ secrets.ROLEPLAY_LLM_API_KEY }}

- name: Upload sanitized proof
  if: always()
  run: pnpm dlx @roleplay-sh/cli upload all --source ci --mode sanitized_findings
  env:
    ROLEPLAY_CLOUD_URL: https://app.roleplay.sh
    ROLEPLAY_PROJECT_ID: ${{ secrets.ROLEPLAY_PROJECT_ID }}
    ROLEPLAY_API_KEY: ${{ secrets.ROLEPLAY_API_KEY }}
```

## Development

```bash
corepack enable
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm vitest run --testTimeout=60000
corepack pnpm build
corepack pnpm package:smoke
```

## License

MIT
