# File Storage Service

A full-stack cloud drive application for managing files and folders, sharing resources with other users, and publishing read-only public links. The UI is a Next.js app; the API is a NestJS service backed by PostgreSQL, Redis, and local disk storage with background job processing for media compression.

## Tech stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, TanStack Query, Zustand, Axios |
| **Backend** | NestJS 11, TypeScript, Prisma, PostgreSQL, Redis, BullMQ |
| **Auth** | JWT (Bearer + httpOnly cookie sessions) |
| **Media** | Multer uploads, Sharp (images), FFmpeg (video), local filesystem storage |
| **Docs** | Swagger UI at `/docs` (enabled in development by default) |
| **Infra (local)** | Docker Compose (PostgreSQL 18, Redis 7) |

## Prerequisites

- Node.js 20+
- npm
- Docker & Docker Compose (for PostgreSQL and Redis)

## Getting started

### 1. Start infrastructure

From the repository root:

```bash
docker compose up -d
```

This starts:

- **PostgreSQL** on `localhost:5433` (database: `file_storage_service`)
- **Redis** on `localhost:6379`

### 2. Configure environment

**Server** — copy the example env and adjust if needed:

```bash
cp server/.env.example server/.env
```

**Client** — create `client/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

### 3. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 4. Database setup

```bash
cd server
npm run prisma:generate
npm run db:push
npm run db:seed
```

Set `SEED_DEV_DATA=true` and `SEED_DEV_PASSWORD` in `server/.env` to populate development users and sample resources. Seed users use emails like `owner1@seed.local` with the configured password.

### 5. Run the application

In separate terminals:

```bash
# API (port 3000)
cd server && npm run start:dev

# Background worker (image/video processing)
cd server && npm run start:worker

# Web UI (port 3001)
cd client && npm run dev
```

| Service | URL |
| --- | --- |
| Web UI | http://localhost:3001 |
| REST API | http://localhost:3000 |
| Swagger | http://localhost:3000/docs |

## Frontend routes

Next.js uses the **Pages Router** under `client/src/pages/`.

| Route | Page | Description |
| --- | --- | --- |
| `/` | Home | Landing / entry screen |
| `/login` | Login | Sign in and registration |
| `/drive` | Drive | Personal file manager (folders, uploads, search) |
| `/drive/shared` | Shared drive | Resources shared with the current user |
| `/drive/public/[token]` | Public link | Read-only view of a published link (no auth required) |

Real-time updates in the drive use **Server-Sent Events** from `GET /events/stream` (see API routes below).

## API routes

Base URL: `http://localhost:3000` (or `NEXT_PUBLIC_API_BASE_URL` on the client).

Unless noted, endpoints require authentication via Bearer token or session cookie.

### Auth — `/auth`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | No | Register a new user |
| `POST` | `/auth/login` | No | Sign in |
| `POST` | `/auth/logout` | Yes | Revoke current session |
| `GET` | `/auth/me` | Yes | Current user profile |

### Resources — `/resources`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/resources/children` | List children of a folder (query: parent, pagination) |
| `GET` | `/resources/shared` | List resources shared with the user |
| `GET` | `/resources/folders` | Folder tree for navigation |
| `GET` | `/resources/path/:folderId` | Breadcrumb path to a folder |
| `GET` | `/resources/search` | Search by name |
| `GET` | `/resources/:id/file` | Download/stream original file |
| `GET` | `/resources/:id/file/compressed` | Download/stream compressed variant |
| `POST` | `/resources/folders` | Create folder |
| `PATCH` | `/resources/:id` | Rename or update metadata |
| `PATCH` | `/resources/:id/reorder` | Change sort order among siblings |
| `PATCH` | `/resources/:id/move` | Move to another parent |
| `POST` | `/resources/:id/clone` | Duplicate resource |
| `DELETE` | `/resources/:id` | Delete resource |

### Uploads — `/uploads`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/uploads/image` | Upload image (`multipart/form-data`, field `file`) |
| `POST` | `/uploads/video` | Upload video (`multipart/form-data`, field `file`) |

### Shares — `/shares`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/shares/invitations` | Invite a user to a resource |
| `GET` | `/shares/resource/:resourceId` | List invitations for a resource |
| `POST` | `/shares/invitations/:id/accept` | Accept invitation |
| `DELETE` | `/shares/invitations/:id` | Revoke invitation |

### Public links — `/public-links`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/public-links` | Yes | Create a public link for a resource |
| `GET` | `/public-links/resource/:resourceId` | Yes | Get active link for a resource |
| `GET` | `/public-links/:token` | No | Resolve link and return resource subtree |
| `GET` | `/public-links/:token/resources/:resourceId/file` | No | Stream file via public link |
| `GET` | `/public-links/:token/resources/:resourceId/file/compressed` | No | Stream compressed file via public link |
| `DELETE` | `/public-links/:id` | Yes | Revoke public link |

### Events — `/events`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/events/stream` | SSE stream of resource changes for the current user |

## Project structure

```
app/
├── client/                 # Next.js frontend
│   └── src/
│       ├── pages/          # Routes (/, /login, /drive, …)
│       ├── components/     # UI by domain (auth, drive, files, sharing, …)
│       ├── hooks/          # Data fetching, mutations, SSE sync
│       ├── services/       # Axios API clients
│       ├── stores/         # Zustand UI and entity state
│       ├── providers/      # React Query provider
│       └── lib/            # Types, constants, tree helpers, permissions
├── server/                 # NestJS backend
│   ├── prisma/             # Schema, migrations, seed
│   └── src/
│       ├── auth/           # Login, register, sessions, JWT
│       ├── resources/      # CRUD, search, file streaming, hierarchy
│       ├── uploads/        # Multipart image/video upload
│       ├── shares/         # Share invitations and permissions
│       ├── public-links/   # Token-based public access
│       ├── events/         # SSE resource notifications
│       ├── jobs/           # BullMQ processors (compression, etc.)
│       ├── worker/         # Standalone worker entrypoint
│       ├── storage/        # Filesystem paths and I/O
│       ├── permissions/    # Role checks (viewer / editor)
│       ├── config/         # Environment configuration
│       └── common/         # Guards, Redis, rate limits, observability
└── docker-compose.yml      # PostgreSQL + Redis for local development
```

### Frontend (`client/`)

- **`pages/`** — file-based routing; thin pages delegate to screen components.
- **`components/drive/`** — main drive UI (sidebar, file list, shared view).
- **`components/sharing/`** — sharing panel and public link viewer.
- **`hooks/`** — React Query hooks for resources, auth, shares, and SSE sync (`useResourceSync`).
- **`services/`** — HTTP layer (`api.ts`, `resources.api.ts`).
- **`stores/`** — client-side drive UI state and normalized resource entities.

### Backend (`server/`)

- **`resources/`** — core domain: query, mutations, access control, file delivery.
- **`uploads/`** — accept uploads, enqueue processing jobs.
- **`jobs/` + `worker/`** — async image/video processing via BullMQ (run `start:worker` separately from the API).
- **`events/`** — push resource updates to connected clients over SSE.
- **`prisma/schema.prisma`** — models: `User`, `Resource`, `ResourcePermission`, `ShareInvitation`, `PublicLink`, `AuthSession`.

## Environment variables

### Server (`server/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listen port |
| `CLIENT_ORIGIN` | `http://localhost:3001` | CORS allowed origin |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | Secret for signing access tokens |
| `REDIS_HOST` | `localhost` | Redis host for sessions, cache, queues |
| `REDIS_PORT` | `6379` | Redis port |
| `SEED_DEV_DATA` | — | Set to `true` to run dev seed |
| `SEED_DEV_PASSWORD` | — | Password for seeded users |
| `ENABLE_SWAGGER` | auto in dev | Set `true` to force Swagger on |
| `RUN_WORKERS` | `true` | When `false`, API skips in-process workers |

See `server/.env.example` for a minimal local template.

### Client (`client/.env.local`)

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Backend base URL for browser requests |

## Scripts

### Server

| Command | Description |
| --- | --- |
| `npm run start:dev` | API with hot reload |
| `npm run start:worker` | Background job worker |
| `npm run build` | Production build |
| `npm run start:prod` | Run compiled API |
| `npm run db:push` | Apply Prisma schema to database |
| `npm run db:seed` | Seed development data |
| `npm test` | Unit + integration tests |

### Client

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server on port 3001 |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm test` | Unit tests (Mocha) |

## Testing

```bash
cd server && npm test
cd client && npm test
```

Coverage reports: `npm run test:cov` in either package.

## Production notes

- Run the API (`start:prod`) and the worker (`start:worker`) as separate processes.
- Set `NODE_ENV=production`, use strong `JWT_SECRET`, and disable `SEED_DEV_DATA`.
- Configure `CLIENT_ORIGIN` to your deployed frontend URL.
- Ensure Redis and PostgreSQL are available; file storage uses the server filesystem (see `storage/` module).