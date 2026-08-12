# @doondo/backend

Express + PostgreSQL + Socket.IO API for Doondo. Versioned at `/api/v1`.

## Stack

- **Runtime**: Node 20+, TypeScript, tsx for dev, tsc for build
- **HTTP**: Express 4 with helmet, cors, compression, rate-limiter
- **DB**: PostgreSQL (Supabase) via Drizzle ORM
- **Real-time**: Socket.IO 4
- **Auth**: JWT (access + refresh) with rotation and reuse detection
- **Validation**: Zod (request body, query, params)
- **Logging**: pino with request IDs

## Folder layout

```
src/
├── config/         # env validation, DB connection
├── lib/            # framework-agnostic utilities (logger, jwt, errors, ids)
├── middleware/     # express middleware (auth, error, validate, rateLimit, requestId)
├── modules/
│   ├── auth/       # signup, login, refresh, logout, me
│   └── users/      # User + RefreshToken models
├── routes/
│   └── v1.ts       # composes all module routers under /api/v1
├── sockets/        # Socket.IO server + namespaces
├── server.ts       # express + socket.io setup
└── index.ts        # entry point
```

## Getting started

```bash
# from /Users/_itsshree/Doondo\ V2 root
pnpm install

# in apps/backend
cp .env.example .env
# fill in JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (use `openssl rand -base64 64`)
# fill in DATABASE_URL with a Supabase/PostgreSQL connection string

# apply pending Drizzle migrations
pnpm --filter @doondo/backend db:migrate

# run the dev server
pnpm dev:backend
```

The server listens on `http://localhost:4000` by default.

## Endpoints

### Health
- `GET /healthz` — returns `{ ok: true, uptime, requestId }`

### Auth (v1)
- `POST /api/v1/auth/register` — create account, returns access+refresh tokens
- `POST /api/v1/auth/login` — sign in, returns access+refresh tokens
- `POST /api/v1/auth/refresh` — exchange refresh token for new pair (rotation)
- `POST /api/v1/auth/logout` — revoke current refresh token
- `GET  /api/v1/auth/me` — current user (requires Bearer access token)

## Response envelope

Every response uses the same shape so the mobile client can handle them in one place:

```jsonc
// success
{ "ok": true, "data": { /* ... */ }, "requestId": "..." }

// error
{
  "ok": false,
  "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "Email or password is incorrect.", "details": null },
  "requestId": "..."
}
```

## Security notes

- Passwords hashed with bcrypt (cost 11 by default — see `BCRYPT_ROUNDS`).
- Refresh tokens are stored as SHA-256 hashes — the raw token only exists in
  the client's secure storage. We can't recover them server-side.
- Refresh rotation: every refresh issues a new pair and revokes the old one.
  Reusing a revoked refresh token revokes the entire token family — the
  classic "stolen refresh token" defense.
- Rate limits are applied globally and tightened on `/auth/*` endpoints.
