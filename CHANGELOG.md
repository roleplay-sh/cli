# Changelog

All notable changes to roleplay.sh will be documented in this file.

This project follows semantic versioning after the public `0.1.0` release.

## 0.1.0 - 2026-05-17

### Added

- Initial `roleplay` CLI.
- Scenario YAML validation with Zod.
- HTTP, CLI, and mock target adapters.
- Mock and OpenAI roleplayed-user providers.
- Mock and OpenAI judge implementations.
- Local run storage under `.roleplay/runs`.
- JSON and Markdown report generation.
- `init`, `scenario:create`, `run`, `report`, `replay`, `list`, `doctor`, `redteam`, and experimental `mcp` commands.
- Example agents and scenarios.
- Vitest test suite, linting, strict TypeScript, tsup build, CI, and npm publish workflow.
- Package smoke test that verifies tarball contents and installed CLI behavior.
- Failed-run artifact persistence for target/provider/judge errors.
- Safer CLI target execution defaults and explicit `shell: true` opt-in.
- Red-team target validation and optional `--save` for generated scenarios.
- HTTP target diagnostics for text responses, missing fields, and timeouts.

### Notes

- MCP support is a roadmap stub in this release.
- Mock provider and mock judge are the stable path for first local usage.
- OpenAI mode requires `OPENAI_API_KEY` and should be treated as experimental until more live usage is collected.
