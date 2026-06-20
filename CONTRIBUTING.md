# Contributing

Thanks for helping improve roleplay.sh.

## Development

```bash
corepack enable
pnpm install
pnpm test
pnpm build
```

Use local attack-pack execution for tests and examples. External provider behavior is part of the public CLI; keep provider additions explicit, tested, documented, and vendor-neutral in user-facing examples.

Judge changes must preserve all three user-facing modes:

- `rules` for deterministic smoke/offline checks.
- `semantic` for provider-backed security evaluation.
- `hybrid` for semantic evaluation plus deterministic guardrails.

## Pull requests

- Keep changes focused.
- Add tests for behavior changes.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Do not commit secrets, `.env`, or generated run artifacts.

## Security

Scenarios and transcripts can contain sensitive data. Avoid pasting real customer data into issues or pull requests.
