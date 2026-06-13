# Changelog

All notable changes to roleplay.sh will be documented in this file.

This project follows semantic versioning after the public `0.1.0` release.

## 0.1.4 - Unreleased

### Changed

- Updated CLI upload, doctor, and setup copy for the paid roleplay.sh cloud workbench.
- Clarified that production uploads require a Builder or Team trial, project API key, and sanitized upload policy.
- Kept public command syntax stable while preserving mock smoke tests and BYO provider usage for real runs.

## 0.1.3 - 2026-06-06

### Added

- Adaptive LLM attacker providers for OpenAI, Anthropic, Google Gemini, and OpenAI-compatible APIs.
- LLM transcript judging against scenario success and failure criteria.
- `--provider`, `--attacker-provider`, `--judge-provider`, model, and OpenAI-compatible base URL flags.
- Scenario YAML support for attacker and judge provider settings.

### Changed

- Real HTTP and CLI targets default to LLM provider mode for `social-engineering-core`.
- Mock mode remains available as an explicit deterministic smoke-test path with `--target mock --provider mock`.

## 0.1.2 - 2026-06-03

### Changed

- Corrected packaged documentation to match the public launch scope.

## 0.1.1 - 2026-06-03

### Added

- Dedicated public CLI package for local attack-pack execution.
- Built-in `social-engineering-core` attack pack.
- Local reports and replayable transcripts.
- Sanitized cloud workbench upload support.

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
