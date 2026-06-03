# roleplay.sh CLI

Social-engineering regression tests for AI agents.

`roleplay` runs adversarial roleplay scenarios against local, HTTP, CLI, or mock agents, records replayable evidence, and can upload sanitized findings to Team Cloud.

## Install

```bash
npm install -g @roleplay-sh/cli
```

Or run without installing:

```bash
npx @roleplay-sh/cli --help
```

## Quickstart

```bash
roleplay init
roleplay run social-engineering-core --target mock --fail-on critical
roleplay report latest
roleplay replay latest
```

## Test A Local Agent

HTTP target:

```bash
roleplay run social-engineering-core \
  --target http://localhost:3000/agent \
  --fail-on critical
```

CLI target:

```bash
roleplay run social-engineering-core \
  --target-command "node ./agent.js" \
  --fail-on critical \
  --yes
```

## Upload Sanitized Findings To Team Cloud

Create a project and API key in Team Cloud at `https://app.roleplay.sh`, then run:

```bash
ROLEPLAY_CLOUD_URL=https://app.roleplay.sh \
ROLEPLAY_PROJECT_ID=<project-id> \
ROLEPLAY_API_KEY=<project-api-key> \
roleplay upload all --mode sanitized_findings --source ci
```

Sanitized upload is the default. Full transcripts, raw scenario YAML, and local metadata stay in your environment unless full transcript upload is explicitly enabled by project policy and CLI mode.

## Commands

- `roleplay init` creates local config and starter scenarios.
- `roleplay run` runs a scenario file or built-in attack pack.
- `roleplay report` prints a saved run report.
- `roleplay replay` replays transcript evidence.
- `roleplay upload` uploads sanitized findings to Team Cloud.
- `roleplay list` lists local runs.
- `roleplay doctor` checks local and Cloud configuration.
- `roleplay mcp` exposes roleplay.sh through MCP.

## CI Example

```yaml
- name: Run roleplay.sh attack pack
  run: pnpm dlx @roleplay-sh/cli run social-engineering-core --fail-on critical
  env:
    ROLEPLAY_TARGET_URL: ${{ secrets.ROLEPLAY_TARGET_URL }}

- name: Upload sanitized findings
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
