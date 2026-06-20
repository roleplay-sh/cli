# Security Policy

## Supported Versions

roleplay.sh is pre-1.0. Security fixes will be released on the latest published minor version.

## Reporting A Vulnerability

Please report security issues privately by opening a GitHub security advisory for the repository, or by emailing the project maintainers once a public security contact is listed.

Do not include real API keys, customer data, private prompts, transcripts, or production scenario files in public issues.

## Data Handling

roleplay.sh stores runs locally under `.roleplay/runs`. Scenario files, hidden context, transcripts, and reports may contain sensitive information. Full transcripts stay local unless you explicitly upload them to the workbench with full-transcript mode enabled in both the project policy and the CLI command.

Provider API keys should stay in your local environment or CI secret store. `roleplay setup` writes placeholders only and does not store raw provider or Workbench API keys by default.

## CLI Target Execution

CLI target scenarios can execute local commands. roleplay.sh requires `--yes` before running CLI targets in automated workflows. By default, commands run without a shell; scenario authors must opt into `shell: true` when shell behavior is required. Review scenario files before running commands from untrusted sources.

## Secrets

roleplay.sh attempts to redact common secret-like values from output and reports. Redaction is best effort. Treat `.env`, scenario hidden context, and generated reports as sensitive by default.
