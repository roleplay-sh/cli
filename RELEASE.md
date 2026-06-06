# Release Guide

This repository publishes the standalone `@roleplay-sh/cli` npm package.

## Preflight

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm vitest run --testTimeout=60000
corepack pnpm build
corepack pnpm package:smoke
```

## npm Trusted Publishing

Configure npm Trusted Publishing for:

- Package: `@roleplay-sh/cli`
- Owner: `roleplay-sh`
- Repository: `cli`
- Workflow file: `publish.yml`

The publish workflow uses GitHub OIDC and intentionally does not require an npm token.

## Publish

Create a GitHub release or push a version tag:

```bash
git tag v0.1.3
git push origin v0.1.3
```

The publish workflow runs checks and then publishes with:

```bash
pnpm publish --access public --no-git-checks
```

## Verify

```bash
npm view @roleplay-sh/cli version
npm install -g @roleplay-sh/cli
roleplay --help
roleplay init
roleplay run social-engineering-core --target mock --provider mock --fail-on critical
roleplay report latest
roleplay replay latest
```

For real LLM-backed verification:

```bash
export ROLEPLAY_OPENAI_API_KEY=<openai-key>
roleplay run social-engineering-core --target http://localhost:3000/agent --provider openai --max-turns 1 --fail-on critical
```

For Team Cloud upload verification, create a project API key at `https://app.roleplay.sh` and run:

```bash
ROLEPLAY_CLOUD_URL=https://app.roleplay.sh \
ROLEPLAY_PROJECT_ID=<project-id> \
ROLEPLAY_API_KEY=<project-api-key> \
roleplay upload all --mode sanitized_findings
```
