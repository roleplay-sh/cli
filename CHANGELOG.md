# Changelog

All notable changes to roleplay.sh will be documented in this file.

This project follows semantic versioning after the public `0.1.0` release.

## 0.1.12 - 2026-06-22

### Changed

- Hardened user-facing CLI errors so runtime, provider, environment, endpoint, and file details are not printed by default.
- Added safe error references and support guidance for human and JSON error output.
- Added redacted local debug logs keyed by the same error reference.

## 0.1.11 - 2026-06-22

### Changed

- Removed real attack-pack scenario definitions from the public CLI package.
- Real attack-pack runs now fetch entitled private scenario bundles from the roleplay.sh Workbench.
- Kept only a minimal local mock smoke scenario for install validation.
- Disabled sourcemaps in the public package to avoid leaking source content.

## 0.1.10 - 2026-06-16

### Changed

- Removed trial wording from CLI setup, init, upload guidance, README, and release notes.
- Clarified that real Workbench usage requires a Builder or Team subscription, project API key, and user-selected provider setup.

## 0.1.9 - 2026-06-14

### Changed

- Added judge guidance comments to generated starter scenarios so mock judging, semantic/hybrid judging, and provider identifiers are explained in every template.

## 0.1.8 - 2026-06-14

### Changed

- Changed `roleplay setup` default judge mode to `hybrid`.

## 0.1.7 - 2026-06-14

### Added

- Guided `roleplay setup` for Workbench project, target, provider, and judge configuration.
- Explicit judge modes: `rules`, `semantic`, and `hybrid`.
- Command-specific help for `run`, `doctor`, and `setup`.
- Judge metadata in saved reports so users can see how evidence was evaluated.

### Changed

- Real targets now require an explicit provider and judge choice instead of silently defaulting to a named provider.
- Public README and release copy now present roleplay.sh as a provider-neutral Workbench runner.
- `doctor` now separates attacker provider readiness, judge readiness, entitlement, and upload readiness.

## 0.1.6 - 2026-06-14

### Changed

- Aligned CLI copy with the paid roleplay.sh Workbench model.

## 0.1.4 - 2026-06-14

### Changed

- Updated CLI upload, doctor, and setup copy for the paid roleplay.sh Workbench.
- Clarified that production uploads require a Builder or Team subscription, project API key, and sanitized upload policy.
- Kept public command syntax stable while preserving mock smoke tests and BYO provider usage for real runs.

## 0.1.3 - 2026-06-06

### Added

- Adaptive attacker providers for OpenAI, Anthropic, Google Gemini, and OpenAI-compatible APIs.
- LLM transcript judging against scenario success and failure criteria.
- `--provider`, `--attacker-provider`, `--judge-provider`, model, and OpenAI-compatible base URL flags.
- Scenario YAML support for attacker and judge provider settings.

### Changed

- Real HTTP and CLI targets use provider-backed mode for `social-engineering-core`.
- Mock mode remains available as an explicit deterministic smoke-test path with `--target mock --provider mock`.

## 0.1.2 - 2026-06-03

### Changed

- Corrected packaged documentation to match the public launch scope.

## 0.1.1 - 2026-06-03

### Added

- Dedicated public CLI package for local attack-pack execution.
- Built-in `social-engineering-core` attack pack.
- Local reports and replayable transcripts.
- Sanitized workbench upload support.

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
