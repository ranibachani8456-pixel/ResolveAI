# ResolveAI

ResolveAI is an AI-powered customer support platform under active development. Through Phase 7, it includes a React/Express foundation, a multi-tenant MySQL schema with Prisma, JWT authentication, role-protected organization management, Customer/Ticket APIs, ticket conversations, and private S3 document uploads.

## Project structure

```text
ResolveAi/
├── client/   # React + Vite frontend
└── server/   # Node.js + Express API
```

SQS, document processing, Redis, Qdrant, RAG, Gemini, and advanced ticket workflows are intentionally not implemented yet.

## Planned future stack

The following technologies describe the planned stack. React/Express, local MySQL/Prisma, JWT authentication, organization-level RBAC, Customer/Ticket/Message APIs, and private S3 document storage are configured through Phase 7:

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
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-private-resolveai-documents-bucket
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

## Customer and Ticket API

All routes require a Bearer JWT. OWNER, ADMIN, SUPPORT_AGENT, and VIEWER may read Customers and Tickets; VIEWER cannot create or update them.

| Endpoint | Write roles |
| --- | --- |
| `GET /api/customers` | All authenticated roles |
| `GET /api/customers/:customerId` | All authenticated roles |
| `POST /api/customers` | OWNER, ADMIN, SUPPORT_AGENT |
| `PATCH /api/customers/:customerId` | OWNER, ADMIN, SUPPORT_AGENT |
| `GET /api/tickets` | All authenticated roles |
| `GET /api/tickets/:ticketId` | All authenticated roles |
| `POST /api/tickets` | OWNER, ADMIN, SUPPORT_AGENT |
| `PATCH /api/tickets/:ticketId` | OWNER, ADMIN, SUPPORT_AGENT |

Create a Customer:

```bash
curl -X POST http://localhost:5001/api/customers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Rahul", "email": "rahul@example.com" }'
```

Create a Ticket using a Customer from the same Organization:

```bash
curl -X POST http://localhost:5001/api/tickets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": 1,
    "subject": "Unable to login",
    "description": "Password reset link is not working",
    "priority": "HIGH"
  }'
```

Ticket lists support optional `status`, `priority`, `customerId`, and `assignedToId` filters. Filters are always combined with the Organization ID from the verified JWT:

```bash
curl "http://localhost:5001/api/tickets?status=OPEN&priority=HIGH" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Customer IDs, Ticket IDs, and assignee IDs are tenant-validated. Cross-tenant resources return `404`, and client-provided `organizationId` values are ignored.

## Ticket conversations (Phase 6)

| Endpoint | Allowed roles |
| --- | --- |
| `GET /api/tickets/:ticketId/messages` | OWNER, ADMIN, SUPPORT_AGENT, VIEWER |
| `POST /api/tickets/:ticketId/messages` | OWNER, ADMIN, SUPPORT_AGENT |

Messages are tenant-scoped. The server checks ticket ownership before reading or creating a message; missing and cross-tenant tickets both return `404`. A verified JWT identifies the tenant/user, and authentication refreshes the user's current membership and role from MySQL so demotion/removal takes effect on subsequent requests.

POST accepts only `content` as message data. It trims whitespace, rejects empty/non-string content, and limits it to 65,535 UTF-8 bytes (the existing MySQL TEXT capacity, including multibyte characters). Ticket IDs must be positive MySQL INTEGER values. Invalid input returns `400`.

The creation flow is authentication → write-role check → input validation → tenant-ticket check → transactional Message insert → `201`. Identity fields supplied in the body are ignored: the server sets `organizationId` and `userId` from authentication, `ticketId` from the URL, `senderType=SUPPORT_AGENT`, and `customerId=null`.

GET returns `{ "success": true, "data": { "messages": [...] } }`, sorted by `createdAt ASC, id ASC`. POST returns the created message in `data.message`. Messages include sender type, IDs, content, timestamp, and safe sender name/role information, never password hashes. The existing schema supports CUSTOMER, SUPPORT_AGENT, AI, and SYSTEM, but this API creates only SUPPORT_AGENT messages. No schema change or migration is required.

### Manual verification

Start the backend in one terminal:

```bash
cd /Users/ranib/Desktop/ResolveAi/server
npm run dev
```

In a second terminal, replace token/ID placeholders with your local values. Obtain each token through `/api/auth/login` using an account of that role. Do not share tokens or commit them.

```bash
BASE_URL=http://localhost:5001/api
TICKET_ID=1 # Replace with a ticket in your organization
OTHER_TICKET_ID=2 # Replace with a ticket in another organization
OWNER_TOKEN='REPLACE_WITH_OWNER_JWT'
ADMIN_TOKEN='REPLACE_WITH_ADMIN_JWT'
AGENT_TOKEN='REPLACE_WITH_SUPPORT_AGENT_JWT'
VIEWER_TOKEN='REPLACE_WITH_VIEWER_JWT'

curl -i "$BASE_URL/health"
curl -i "$BASE_URL/db-health"

# Login: replace the example account values, then copy data.token.
curl -i -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"organizationSlug":"YOUR_ORG_SLUG","email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'

# All four roles can read: each should return 200.
for TOKEN in "$OWNER_TOKEN" "$ADMIN_TOKEN" "$AGENT_TOKEN" "$VIEWER_TOKEN"; do
  curl -i "$BASE_URL/tickets/$TICKET_ID/messages" -H "Authorization: Bearer $TOKEN"
done

# These intentionally create real messages: each should return 201.
for TOKEN in "$OWNER_TOKEN" "$ADMIN_TOKEN" "$AGENT_TOKEN"; do
  curl -i -X POST "$BASE_URL/tickets/$TICKET_ID/messages" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"content":"  Phase 6 manual test  "}'
done

# VIEWER cannot write: 403.
curl -i -X POST "$BASE_URL/tickets/$TICKET_ID/messages" \
  -H "Authorization: Bearer $VIEWER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"Must be blocked"}'

# Invalid ID and empty content: 400.
curl -i "$BASE_URL/tickets/abc/messages" -H "Authorization: Bearer $OWNER_TOKEN"
curl -i -X POST "$BASE_URL/tickets/$TICKET_ID/messages" \
  -H "Authorization: Bearer $OWNER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"   "}'

# Missing ticket and cross-tenant reads/writes: 404.
curl -i "$BASE_URL/tickets/2147483647/messages" -H "Authorization: Bearer $OWNER_TOKEN"
curl -i "$BASE_URL/tickets/$OTHER_TICKET_ID/messages" -H "Authorization: Bearer $OWNER_TOKEN"
curl -i -X POST "$BASE_URL/tickets/$OTHER_TICKET_ID/messages" \
  -H "Authorization: Bearer $OWNER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"Must be blocked"}'

# Identity override attempt: 201, but stored IDs must match your token/URL,
# senderType must be SUPPORT_AGENT and customerId must be null.
curl -i -X POST "$BASE_URL/tickets/$TICKET_ID/messages" \
  -H "Authorization: Bearer $OWNER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"content":"Identity test","organizationId":999,"userId":999,"customerId":999,"ticketId":999,"senderType":"AI"}'

# Inspect oldest-first ordering and safe fields.
curl -i "$BASE_URL/tickets/$TICKET_ID/messages" -H "Authorization: Bearer $VIEWER_TOKEN"
```

### Automated verification

```bash
cd /Users/ranib/Desktop/ResolveAi/server
npm test
npm run test:integration
npm run prisma:validate
npm run prisma:generate
npx prisma migrate status
```

`npm test` uses stubs without database writes. The opt-in integration command requires working local MySQL and JWT configuration. It exercises real HTTP handlers and MySQL using temporary fixtures inside one transaction, then deliberately rolls back and checks row counts. Existing records are not modified. MySQL auto-increment counters may advance even when inserts roll back. These tests are local regression checks, not load/concurrency tests.

## Document metadata and S3 uploads (Phase 7)

| Endpoint | Allowed roles |
| --- | --- |
| `POST /api/documents` | OWNER, ADMIN |
| `GET /api/documents` | OWNER, ADMIN, SUPPORT_AGENT, VIEWER |
| `GET /api/documents/:documentId` | OWNER, ADMIN, SUPPORT_AGENT, VIEWER |

POST accepts exactly one `multipart/form-data` field named `file`. PDF (`application/pdf`) and UTF-8 plain text (`text/plain`) are supported, up to 10 MB. Empty, oversized, unsupported, and content-type-spoofed files are rejected. The authenticated organization—not request body data—controls ownership.

S3 privately stores the file bytes; MySQL stores safe metadata with status `PENDING`. Processing, SQS, chunking, embeddings, Qdrant, Gemini, and RAG are deferred to later phases. Keys are generated as `organizations/{authenticatedOrganizationId}/documents/{UUID}-{sanitizedFilename}`. No public-read ACL is set and API responses do not reveal the storage key.

Configure a private S3 bucket and AWS region. Credentials are intentionally absent from `.env.example`: the AWS SDK uses its normal provider chain, such as a local AWS profile or an IAM role in AWS.

```env
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-private-resolveai-documents-bucket
```

The runtime identity needs `s3:PutObject` and `s3:DeleteObject` only for the bucket's `organizations/*/documents/*` prefix. Keep public access blocked and enable bucket encryption. `DeleteObject` is required because if S3 succeeds but MySQL metadata creation fails, the API makes a best-effort compensating delete. S3 and MySQL cannot form one atomic transaction; a failed cleanup is logged and can leave an orphan requiring operational cleanup.

```bash
BASE_URL=http://localhost:5001/api
OWNER_TOKEN='REPLACE_WITH_OWNER_OR_ADMIN_JWT'
READER_TOKEN='REPLACE_WITH_ANY_ROLE_JWT'
DOCUMENT_ID=1 # Replace after uploading

# This performs a real private S3 upload and creates MySQL metadata.
curl -i -X POST "$BASE_URL/documents" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -F "file=@/absolute/path/to/document.pdf;type=application/pdf" \
  -F "organizationId=999"

curl -i "$BASE_URL/documents" -H "Authorization: Bearer $READER_TOKEN"
curl -i "$BASE_URL/documents/$DOCUMENT_ID" -H "Authorization: Bearer $READER_TOKEN"

# Missing file, unsupported type, and malformed ID should return 400.
curl -i -X POST "$BASE_URL/documents" -H "Authorization: Bearer $OWNER_TOKEN" -F "note=no-file"
curl -i -X POST "$BASE_URL/documents" -H "Authorization: Bearer $OWNER_TOKEN" -F "file=@/absolute/path/to/image.png;type=image/png"
curl -i "$BASE_URL/documents/not-a-number" -H "Authorization: Bearer $READER_TOKEN"
```

The supplied `organizationId=999` is deliberately ignored; returned ownership must match the authenticated organization. GET lists newest first using `createdAt DESC, id DESC`; missing and cross-tenant IDs return the same `404`.

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
- `npm test` runs Message and Document service tests without real database or AWS writes.
- `npm run test:integration` runs rollback-only local MySQL/API regression tests with mocked S3.
- `npm run prisma:generate` regenerates Prisma Client after schema changes.
- `npm run prisma:validate` checks the Prisma schema and configuration.
