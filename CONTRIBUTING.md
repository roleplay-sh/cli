# Contributing

Thanks for helping improve roleplay.sh.

## Development

```bash
corepack enable
pnpm install
pnpm test
pnpm build
```

Use local attack-pack execution for tests and examples. Do not add external model-provider behavior to the public CLI without an explicit product decision.

## Pull requests

- Keep changes focused.
- Add tests for behavior changes.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Do not commit secrets, `.env`, or generated run artifacts.

## Security

Scenarios and transcripts can contain sensitive data. Avoid pasting real customer data into issues or pull requests.
