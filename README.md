# ResolveAI

ResolveAI is the starting point for an AI-powered customer support platform. Phase 1 adds a Prisma connection from the Express API to a local MySQL database, without application models yet.

## Project structure

```text
ResolveAi/
├── client/   # React + Vite frontend
└── server/   # Node.js + Express API
```

Authentication, application data models, cloud services, Redis, RAG, Gemini, tickets, and document uploads are intentionally not implemented yet.

## Planned future stack

The following technologies describe the planned stack. Only the React/Express foundation and local MySQL/Prisma connection are configured through Phase 1:

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

No Prisma models or migrations are included yet. An empty database is sufficient for the connection health check.

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
```

Keep `server/.env` private. It is ignored by Git and must never be committed.

Generate and validate Prisma Client without creating tables:

```bash
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
