# Security Policy

## Supported Versions

roleplay.sh is pre-1.0. Security fixes will be released on the latest published minor version.

## Reporting A Vulnerability

Please report security issues privately by opening a GitHub security advisory for the repository, or by emailing the project maintainers once a public security contact is listed.

Do not include real API keys, customer data, private prompts, transcripts, or production scenario files in public issues.

## Data Handling

roleplay.sh stores runs locally under `.roleplay/runs`. Scenario files, hidden context, transcripts, and reports may contain sensitive information.

When using OpenAI providers or judges, scenario data and transcripts are sent to the external provider. Use `--provider mock --judge mock` for local-only testing.

## CLI Target Execution

CLI target scenarios can execute local commands. roleplay.sh requires `--yes` before running CLI targets in automated workflows. By default, commands run without a shell; scenario authors must opt into `shell: true` when shell behavior is required. Review scenario files before running commands from untrusted sources.

## Secrets

roleplay.sh attempts to redact common secret-like values from output and reports. Redaction is best effort. Treat `.env`, scenario hidden context, and generated reports as sensitive by default.
