# Repository Audit Summary

> Internal audit performed during the production-readiness fork. This document captures the baseline state and recommended improvements.

## Current Architecture

```
src/
├── index.ts              # Monolithic entry: CLI parsing, auth, GraphQL client, MCP server
├── lib/
│   ├── formatters.ts     # Shared order/address formatters
│   ├── shopifyAuth.ts    # OAuth client-credentials token exchange + refresh
│   └── toolUtils.ts      # Tool interface, error helpers, Shopify types
└── tools/                # 40 MCP tools (one file each), flat registry
    └── registry.ts
```

**Data flow:** stdin/stdout MCP transport → McpServer → tool registry → GraphQL Admin API.

Each tool holds a module-scoped `GraphQLClient` reference set via `initialize()`.

## Dependency Review

| Area | Finding |
|------|---------|
| Runtime | `@modelcontextprotocol/sdk`, `graphql-request`, `zod`, `dotenv`, `minimist` — appropriate |
| Dev | GraphQL codegen stack for schema validation — good |
| Missing | ESLint not installed despite lint script; no test files despite Jest config |
| Tracked | `package-lock.json` committed; diagnostic `.cjs` scripts at repo root |

## Build System

- TypeScript 5.x with `strict: true` (good baseline)
- ESM (`"type": "module"`, `NodeNext` resolution)
- Build: `rimraf dist && tsc` — works
- No `typecheck` script separate from build

## Linting & Testing

- **Lint:** Script references ESLint but package/config absent — fails
- **Tests:** Jest installed, zero test files — fails with exit code 1
- **CI:** Only GraphQL validation workflow; no build/lint/test pipeline

## Documentation

- README is comprehensive for tool catalog but marketing-heavy (badges, star requests)
- No `.env.example`, contribution guide, or architecture docs
- No troubleshooting beyond MCP log tail command

## Security

- Credentials via CLI args or `.env` (standard for MCP servers)
- No secrets in repo
- Token refresh handled in-memory only (lost on restart)
- No graceful shutdown (timers may leak on SIGTERM)

## Type Safety

- Strict mode enabled but ~70+ `any` usages across tools
- Tool `execute` accepts `Record<string, unknown>` at registry boundary
- No `noUnusedLocals` / `noUnusedParameters`

## Major Weaknesses

1. Monolithic entry point mixing config, auth, networking, and server lifecycle
2. Duplicated client initialization pattern across 40 tool modules
3. No persistence layer for OAuth tokens or cache
4. Missing dev tooling (ESLint, working tests, typecheck script)
5. Temporary diagnostic scripts committed to root
6. No structured logging or graceful shutdown
7. Weak CI coverage (GraphQL only)

## Recommended Improvements

1. Extract config, logging, server bootstrap, and shutdown into dedicated modules
2. Introduce `createTool()` factory to eliminate per-file client boilerplate
3. Add Redis-backed token cache with connection manager, retries, and graceful disconnect
4. Install and configure ESLint + Jest; add unit tests for lib modules
5. Strengthen `tsconfig` (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
6. Remove root `.cjs` diagnostics; add proper integration test harness if needed
7. Redesign README with architecture/workflow diagrams
8. Ignore `package-lock.json`; add `.env.example`
9. Add CI workflow for build, lint, typecheck, and test
