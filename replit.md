# Workspace

## Overview

pnpm workspace monorepo using TypeScript. News Monitoring System backend with FastAPI-style REST API, PostgreSQL, Drizzle ORM, and Replit Auth.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, `drizzle-zod`
- **Auth**: Replit Auth (OpenID Connect + PKCE), cookie-based sessions in PostgreSQL
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

### Tables
- **sessions** — Replit Auth session storage (sid, sess, expire)
- **users** — Users (id, telegram_chat_id, email, first_name, last_name, profile_image_url, created_at, updated_at)
- **sources** — RSS news sources (id, name, rss_url)
- **news** — News articles (id, source_id, title, url, published_at, summary, raw_text)
- **tags** — Tags (id, name)
- **news_tags** — Many-to-many junction: news ↔ tags
- **user_tag_subscriptions** — Many-to-many junction: users ↔ tags
- **user_events** — User event log (id, user_id, event_type, created_at)

## API Endpoints

All routes served under `/api`.

| Method | Path | Description |
|--------|------|-------------|
| GET | /healthz | Health check |
| GET | /auth/user | Current auth state (requires session) |
| GET | /login | Begin Replit OIDC login flow |
| GET | /callback | OIDC callback |
| GET | /logout | OIDC logout |
| POST | /mobile-auth/token-exchange | Mobile auth token exchange |
| POST | /mobile-auth/logout | Mobile session logout |
| GET | /news | News list with tags & summaries (pagination + filter by tag/source) |
| GET | /tags | All tags |
| POST | /users | Create user |
| GET | /analytics | Stats: news by day, top tags, event funnel |

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in `references`

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Key Commands

```bash
# Run codegen after editing openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes
pnpm --filter @workspace/db run push

# Start dev server
pnpm --filter @workspace/api-server run dev

# Build for production
pnpm --filter @workspace/api-server run build
```
