# Changelog

All notable changes to roleplay.sh will be documented in this file.

This project follows semantic versioning after the public `0.1.0` release.

## 0.1.2 - 2026-06-03

### Changed

- Corrected packaged documentation to match the public launch scope.

## 0.1.1 - 2026-06-03

### Added

- Dedicated public CLI package for local attack-pack execution.
- Built-in `social-engineering-core` attack pack.
- Local reports and replayable transcripts.
- Sanitized Team Cloud upload support.

## 0.1.0 - 2026-05-17

### Added

- Initial `roleplay` CLI.
- Scenario YAML validation with Zod.
- HTTP, CLI, and mock target adapters.
- Local deterministic roleplayed-user provider.
- Local deterministic judge implementation.
- Local run storage under `.roleplay/runs`.
- JSON and Markdown report generation.
- `init`, `run`, `report`, `replay`, `list`, `upload`, `doctor`, and `mcp` commands.
- Example agents and scenarios.
- Vitest test suite, linting, strict TypeScript, tsup build, CI, and npm publish workflow.
- Package smoke test that verifies tarball contents and installed CLI behavior.
- Failed-run artifact persistence for target/provider/judge errors.
- Safer CLI target execution defaults and explicit `shell: true` opt-in.
- HTTP target diagnostics for text responses, missing fields, and timeouts.

### Notes

- Local attack-pack execution is the supported path for first usage.
