# ResolveAI

ResolveAI is the starting point for an AI-powered customer support platform. This repository currently contains only a clean React frontend and Express backend foundation.

## Project structure

```text
ResolveAi/
├── client/   # React + Vite frontend
└── server/   # Node.js + Express API
```

Database, authentication, cloud services, Redis, RAG, Gemini, tickets, and document uploads are intentionally not implemented yet.

## Planned future stack

The following technologies are planned for later phases and are not installed or configured in Phase 0:

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

## 1. Configure the backend

```bash
cd server
cp .env.example .env
npm install
npm run dev
nodemon server.js
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

## 2. Configure the frontend

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
