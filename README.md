# ResolveAI

ResolveAI is an AI-powered customer support platform under active development. Through Phase 4, it includes a React/Express foundation, a multi-tenant MySQL schema with Prisma, JWT authentication, and role-protected organization member management.

## Project structure

```text
ResolveAi/
├── client/   # React + Vite frontend
└── server/   # Node.js + Express API
```

Ticket, customer, and message CRUD APIs, cloud services, Redis, RAG, Gemini, ticket workflows, and document uploads are intentionally not implemented yet.

## Planned future stack

The following technologies describe the planned stack. React/Express, local MySQL/Prisma, JWT authentication, and organization-level RBAC are configured through Phase 4:

- **Frontend:** React.js, JavaScript, and Vite
- **Backend:** Node.js, Express.js, JavaScript, and REST APIs
- **Database:** MySQL with Prisma ORM; AWS RDS for MySQL in production
- **Vector database:** Qdrant
- **Cache:** Redis
- **Cloud:** AWS S3, SQS, RDS, ECS, IAM, CloudWatch, and CloudFront
- **AI:** Gemini API and RAG
- **Authentication:** JWT
- **Infrastructure:** Docker

## Prerequisites

- Node.js 20 or newer
- npm
- MySQL Server 8 or newer, running locally on port `3306`

## 1. Create the local MySQL database

Sign in to MySQL with an account that can create databases:

```bash
mysql -u root -p
```

At the MySQL prompt, create the empty database and then exit:

```sql
CREATE DATABASE resolveai;
EXIT;
```

Prisma migrations create and update the application tables inside this database.

## 2. Configure the backend

```bash
cd server
cp .env.example .env
npm install
```

Open `server/.env` and replace `USERNAME` and `PASSWORD` with your local MySQL credentials:

```env
PORT=5001
NODE_ENV=development
CLIENT_URL=http://localhost:5173
DATABASE_URL="mysql://USERNAME:PASSWORD@localhost:3306/resolveai"
JWT_SECRET="YOUR_RANDOM_SECRET_WITH_AT_LEAST_32_CHARACTERS"
JWT_EXPIRES_IN=1d
BCRYPT_ROUNDS=12
```

Keep `server/.env` private. It is ignored by Git and must never be committed.

You can generate a strong JWT secret locally with `openssl rand -base64 48`. Copy its output into `JWT_SECRET`; do not commit or share it.

Apply existing migrations, generate Prisma Client, and validate the schema:

```bash
npx prisma migrate dev
npm run prisma:generate
npm run prisma:validate
```

Start the backend with nodemon:

```bash
npm run dev
```

The API runs at `http://localhost:5001`. Test it at:

```bash
curl http://localhost:5001/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "ResolveAI API is running"
}
```

Test the MySQL connection:

```bash
curl http://localhost:5001/api/db-health
```

Expected response when MySQL and `DATABASE_URL` are configured correctly:

```json
{
  "success": true,
  "message": "Database connection successful"
}
```

An unavailable or incorrectly configured database returns HTTP `503` with a generic message; credentials and connection details are not exposed.

## Authentication API

Register a new Organization and its first OWNER:

```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "organizationName": "Acme Support",
    "organizationSlug": "acme-support",
    "name": "Rani",
    "email": "rani@example.com",
    "password": "strong-password"
  }'
```

Log in using the Organization slug and User email:

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "organizationSlug": "acme-support",
    "email": "rani@example.com",
    "password": "strong-password"
  }'
```

Copy the returned token and request the authenticated User:

```bash
curl http://localhost:5001/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Passwords are stored only as bcrypt hashes. JWTs contain the authenticated User ID, Organization ID, and role; `/api/auth/me` derives identity only from a verified Bearer token.

## Organization and member API

All organization routes require `Authorization: Bearer YOUR_JWT_TOKEN`. Tenant identity always comes from the verified token; a client-provided `organizationId` is never used.

| Endpoint | Allowed roles |
| --- | --- |
| `GET /api/organization` | OWNER, ADMIN, SUPPORT_AGENT, VIEWER |
| `GET /api/organization/users` | OWNER, ADMIN |
| `POST /api/organization/users` | OWNER, ADMIN |
| `PATCH /api/organization/users/:userId/role` | OWNER |

Create an organization member:

```bash
curl -X POST http://localhost:5001/api/organization/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aman",
    "email": "aman@example.com",
    "password": "strong-password",
    "role": "SUPPORT_AGENT"
  }'
```

New members may be ADMIN, SUPPORT_AGENT, or VIEWER. OWNER creation remains exclusive to organization registration, while an existing OWNER may promote a member later.

Update a member role:

```bash
curl -X PATCH http://localhost:5001/api/organization/users/2/role \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "role": "ADMIN" }'
```

The role update is tenant-scoped, and the only remaining OWNER cannot be demoted.

## 3. Configure the frontend

Open a second terminal:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. During development, Vite proxies `/api` requests to the backend on port `5001`.

For a separately hosted API, set `VITE_API_URL` in `client/.env` to the API origin, for example:

```env
VITE_API_URL=https://api.example.com
```

## Available scripts

Run these inside `client/`:

- `npm run dev` starts Vite's development server.
- `npm run build` creates a production frontend build.
- `npm run preview` previews the production build locally.

Run these inside `server/`:

- `npm run dev` starts the API with nodemon and restarts it when server files change.
- `npm start` starts the API normally.
- `npm run prisma:generate` regenerates Prisma Client after schema changes.
- `npm run prisma:validate` checks the Prisma schema and configuration.
