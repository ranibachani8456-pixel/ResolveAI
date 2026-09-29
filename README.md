# ResolveAI

ResolveAI is an AI-powered customer support platform under active development. Through Phase 13, it includes password and Google authentication, hardened tenant-authoritative RBAC, a public customer-to-agent ticket flow, a production-style React support dashboard backed by the existing Express API, a multi-tenant MySQL schema with Prisma, Customer/Ticket APIs, ticket conversations, private S3 uploads, asynchronous SQS jobs, document ingestion into Qdrant, tenant-safe grounded knowledge-base answers using Gemini, and persistent user-owned AI conversations with bounded multi-turn history.

## Project structure

```text
ResolveAi/
├── client/   # React + Vite frontend
└── server/   # Node.js + Express API
```

Automatic ticket replies, Redis, streaming, reranking, hybrid search, and advanced ticket workflows are intentionally not implemented yet. Phase 12 adds the authenticated support workspace without changing the established backend contracts.

## Planned future stack

The following technologies describe the planned stack. React/Express, the support dashboard, local MySQL/Prisma, password and Google authentication, JWTs, organization-level RBAC, Customer/Ticket/Message APIs, private S3 storage, SQS document jobs, Gemini embeddings, Qdrant indexing, grounded RAG answers, and persistent AI conversations are configured through Phase 13:

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
AWS_SQS_DOCUMENT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/resolveai-document-processing
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
EMBEDDING_MODEL=gemini-embedding-2
EMBEDDING_DIMENSION=768
EMBEDDING_BATCH_SIZE=20
GEMINI_GENERATION_MODEL=gemini-3.8-flash
QDRANT_URL=https://YOUR_CLUSTER.cloud.qdrant.io
QDRANT_API_KEY=YOUR_QDRANT_API_KEY
QDRANT_COLLECTION=resolveai_documents
RAG_TOP_K=5
RAG_CONTEXT_MAX_CHARS=6000
RAG_QUESTION_MAX_CHARS=2000
AI_HISTORY_MAX_MESSAGES=10
AI_HISTORY_MAX_CHARS=6000
DOCUMENT_PROCESSING_LEASE_SECONDS=240
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
| `GET /api/documents/:documentId/content` | OWNER, ADMIN, SUPPORT_AGENT, VIEWER |

POST accepts exactly one `multipart/form-data` field named `file`. PDF (`application/pdf`) and UTF-8 plain text (`text/plain`) are supported, up to 10 MB. Empty, oversized, unsupported, and content-type-spoofed files are rejected. The authenticated organization—not request body data—controls ownership.

S3 privately stores the file bytes; MySQL stores safe metadata with status `PENDING`, then SQS requests Phase 9 ingestion. Keys are generated as `organizations/{authenticatedOrganizationId}/documents/{UUID}-{sanitizedFilename}`. No public-read ACL is set and API responses do not reveal the storage key. The authenticated content endpoint performs a tenant-scoped metadata lookup and serves the bounded private object through the API with `private, no-store` caching; it never returns an S3 key or public URL.

Configure a private S3 bucket and AWS region. Credentials are intentionally absent from `.env.example`: the AWS SDK uses its normal provider chain, such as a local AWS profile or an IAM role in AWS.

```env
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-private-resolveai-documents-bucket
```

The runtime identity needs `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` only for the bucket's `organizations/*/documents/*` prefix. `GetObject` supports authenticated ingestion and previews; it does not make objects public. Keep public access blocked and enable bucket encryption. `DeleteObject` is required because if S3 succeeds but MySQL metadata creation fails, the API makes a best-effort compensating delete. S3 and MySQL cannot form one atomic transaction; a failed cleanup is logged and can leave an orphan requiring operational cleanup.

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
curl -i "$BASE_URL/documents/$DOCUMENT_ID/content" -H "Authorization: Bearer $READER_TOKEN" -o preview-response.bin

# Missing file, unsupported type, and malformed ID should return 400.
curl -i -X POST "$BASE_URL/documents" -H "Authorization: Bearer $OWNER_TOKEN" -F "note=no-file"
curl -i -X POST "$BASE_URL/documents" -H "Authorization: Bearer $OWNER_TOKEN" -F "file=@/absolute/path/to/image.png;type=image/png"
curl -i "$BASE_URL/documents/not-a-number" -H "Authorization: Bearer $READER_TOKEN"
```

The supplied `organizationId=999` is deliberately ignored; returned ownership must match the authenticated organization. GET lists newest first using `createdAt DESC, id DESC`; missing and cross-tenant IDs return the same `404`.

## Asynchronous document jobs (Phase 8)

The API now publishes a lightweight SQS job after S3 upload and `PENDING` metadata creation:

```text
POST /api/documents → private S3 object → PENDING MySQL row → SQS job → HTTP 201
                                                                    ↓
                                             standalone document worker
                                                                    ↓
                                      conditional PENDING → PROCESSING
```

The queue never carries file bytes, JWTs, credentials, storage keys, or user objects. Its strict versioned contract is:

```json
{
  "type": "DOCUMENT_PROCESSING_REQUESTED",
  "version": 1,
  "documentId": 17,
  "organizationId": 1
}
```

Configure the main queue URL in the private `server/.env`; credentials continue to come from the AWS SDK default provider chain (`AWS_PROFILE` may be used locally but should not be committed):

```env
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-private-resolveai-documents-bucket
AWS_SQS_DOCUMENT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/resolveai-document-processing
```

Run the API and worker as separate processes:

```bash
# Terminal 1
cd /Users/ranib/Desktop/ResolveAi/server
npm run dev

# Terminal 2
cd /Users/ranib/Desktop/ResolveAi/server
npm run worker:documents
```

The worker long-polls for up to 20 seconds and receives at most five messages per request. It validates the entire message contract, queries/updates using both `documentId` and `organizationId`, and atomically claims only `PENDING` rows. SQS Standard queues provide at-least-once delivery, so duplicate messages are expected:

- `PENDING` is atomically claimed as `PROCESSING`, then Phase 9 runs the ingestion pipeline described below.
- A fresh `PROCESSING` delivery is not acknowledged; it becomes visible again for a later retry. A stale processing lease can be reclaimed safely.
- `READY` is acknowledged as already complete.
- `FAILED` is deliberately acknowledged and left failed; a future explicit retry flow may reset/requeue it.
- Missing/cross-tenant documents are acknowledged safe no-ops.
- Invalid messages and unexpected database/SQS failures are not deleted. Visibility timeout retries them, then the DLQ redrive policy isolates repeated failures.

### Upload consistency

S3, MySQL, and SQS cannot share an ACID transaction. If SQS publishing fails after metadata creation, the API conditionally deletes the exact row created by that request and then deletes its exact generated S3 object. If metadata cleanup is uncertain, the S3 object is retained rather than leaving a surviving row pointing to a deleted object. Cleanup failures are logged and can require operational reconciliation. An ambiguous network failure may have delivered the job before compensation; the worker safely acknowledges it as missing.

### SQS and DLQ setup in the AWS Console

Use the same AWS Region as `AWS_REGION`.

1. Open **Amazon SQS → Queues → Create queue**.
2. Create the DLQ first:
   - Type: **Standard**.
   - Name: `resolveai-document-processing-dlq`.
   - Visibility timeout: **60 seconds**.
   - Message retention: **14 days** so failures remain available for investigation.
   - Receive message wait time: **20 seconds**.
   - Encryption: enable **SSE-SQS** unless your organization requires a customer-managed KMS key.
   - Leave delivery delay at zero and create the queue.
3. Create the main queue:
   - Type: **Standard**; strict ordering is unnecessary and the worker is idempotent.
   - Name: `resolveai-document-processing`.
   - Visibility timeout: **at least 300 seconds** for the initial Phase 9 setup. It should exceed normal end-to-end ingestion time and the configured 240-second processing lease.
   - Message retention: **4 days** for development.
   - Receive message wait time: **20 seconds** to reduce empty responses and cost.
   - Encryption: enable **SSE-SQS**.
   - Expand **Dead-letter queue**, enable it, select `resolveai-document-processing-dlq`, and set **Maximum receives** to `5` so transient errors get several attempts without creating a poison-message loop.
4. Return to the DLQ, choose **Edit → Redrive allow policy**, choose **byQueue**, and allow only the ARN of `resolveai-document-processing`.
5. Open the main queue's details page and copy its **URL** (not its ARN) into `AWS_SQS_DOCUMENT_QUEUE_URL`.

The worker explicitly requests 20-second long polling. AWS recommends long polling to reduce empty/false-empty responses, and the visibility timeout must exceed expected processing time. A Standard queue can deliver duplicates, which is why the database transition is conditional. See the AWS guidance for [long polling](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/best-practices-setting-up-long-polling.html), [visibility timeouts](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html), and [DLQs](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html).

### Least-privilege IAM addition

Attach this additional policy to the local ResolveAI IAM identity, replacing all three placeholders. The code does not call `ChangeMessageVisibility` or `GetQueueAttributes`, so those permissions are intentionally absent.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ResolveAIDocumentQueueProducer",
      "Effect": "Allow",
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:YOUR_REGION:YOUR_ACCOUNT_ID:resolveai-document-processing"
    },
    {
      "Sid": "ResolveAIDocumentQueueWorker",
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage"
      ],
      "Resource": "arn:aws:sqs:YOUR_REGION:YOUR_ACCOUNT_ID:resolveai-document-processing"
    }
  ]
}
```

Do not use `sqs:*` or `Resource: "*"`. The DLQ needs no application IAM permission because SQS performs redrive according to the queue policy. AWS supports scoping SQS actions to the queue ARN; see the [official IAM examples](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-basic-examples-of-iam-policies.html).

### Real-AWS verification

After the API and worker are running in separate terminals, use an OWNER/ADMIN token and a small text file:

```bash
printf 'ResolveAI Phase 8 queue test\n' > /tmp/resolveai-phase8.txt
TOKEN='REPLACE_WITH_OWNER_OR_ADMIN_JWT'

curl -i -X POST http://localhost:5001/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@/tmp/resolveai-phase8.txt;type=text/plain'

curl -s http://localhost:5001/api/documents \
  -H "Authorization: Bearer $TOKEN"
```

Expect `201`, a private S3 object, and a safe API response without `storageKey`. The response is the creation snapshot and says `PENDING`; with Phase 9 configured, the follow-up GET should progress through `PROCESSING` to `READY`. Logs contain identifiers and counts, never document text or vectors.

```text
Document job handled: documentId=17 organizationId=1 outcome=COMPLETED status=READY
```

If the message disappears too quickly to view, verify the transition with the GET response and worker log, then inspect the SQS queue's CloudWatch monitoring graphs for messages sent, received, and deleted. For a visual queue check, stop the worker before uploading, confirm one available message in the main queue, then restart the worker; do not repeatedly poll with the Console's receive tool because receives count toward the DLQ redrive threshold.

## Document ingestion pipeline (Phase 9)

The standalone worker now performs the complete knowledge-base ingestion path:

```text
SQS job → tenant-scoped MySQL lookup → private S3 download
        → text/PDF extraction → normalization → deterministic chunks
        → Gemini embeddings → idempotent Qdrant upserts → READY
```

The API process does not require Gemini or Qdrant configuration to start. Those settings are read only when the worker processes a document.

### Extraction, normalization, and chunking

- `text/plain` is decoded as strict UTF-8. Invalid, empty, or unusable text is a permanent document failure.
- `application/pdf` is extracted with `pdf-parse`. Text-based PDFs are supported; OCR is deliberately not included, so scanned/image-only PDFs become `FAILED` with a safe internal reason.
- Normalization removes null characters, converts CRLF/CR to LF, trims trailing line whitespace and outer whitespace, and collapses excessive blank lines while preserving punctuation and paragraphs.
- Chunking targets 1,000 characters with 150 characters of contextual overlap. It prefers paragraph, sentence, newline, then word boundaries and enforces a 1,000-character maximum. Ordering and `chunkIndex` are deterministic.

The worker refuses retrieved objects larger than the existing 10 MB upload limit and obtains `storageKey` only from the trusted MySQL row selected by both `documentId` and `organizationId`.

### Embeddings and Qdrant

Gemini uses the supported `@google/genai` SDK through a dedicated `embedTexts(texts)` abstraction. The default model is `gemini-embedding-2`, using `RETRIEVAL_DOCUMENT`, 768 dimensions, and batches of 20. The Qdrant collection uses 768-dimensional vectors with Cosine distance. If the collection exists, its dimension and distance are verified; it is never deleted or recreated during processing.

Phase 9 adds only three runtime packages: `@google/genai` for Gemini embeddings, `@qdrant/js-client-rest` as Qdrant's official REST client, and `pdf-parse` for Node-compatible text extraction from PDFs.

Each Qdrant point contains only safe, tenant-filterable payload data:

```json
{
  "organizationId": 1,
  "documentId": 30,
  "chunkIndex": 0,
  "text": "Document chunk text...",
  "fileName": "guide.pdf",
  "mimeType": "application/pdf"
}
```

The payload never contains `storageKey`, JWTs, credentials, or passwords. Phase 10 retrieval must always filter on `organizationId` before using these points.

Point IDs are deterministic hashes of `organizationId:documentId:chunkIndex`. SQS duplicate delivery, a partial Qdrant batch failure, or a retry after a failed MySQL `READY` update therefore overwrites the same points instead of creating duplicates. MySQL and Qdrant are not an ACID transaction: a failure can temporarily leave already-upserted points for a `PROCESSING` document, but a retry converges on the same point set.

### Status, retry, and concurrency behavior

- `PENDING`: uploaded and queued.
- `PROCESSING`: atomically claimed and ingestion is active or awaiting retry.
- `READY`: extraction, every embedding, every Qdrant upsert, and the final MySQL update succeeded.
- `FAILED`: a permanent content/metadata error that retrying cannot fix.

Malformed content, unsupported trusted MIME types, missing stored objects, empty extraction, and oversized stored objects are permanent: the worker marks the row `FAILED` and deletes the SQS message. Temporary S3, Gemini, Qdrant, or MySQL failures throw out of processing, leave the row `PROCESSING`, and do not delete the message, allowing SQS retries and eventual DLQ redrive.

A processing lease prevents an immediately duplicated message from starting concurrent work. Fresh `PROCESSING` jobs are left unacknowledged; after `DOCUMENT_PROCESSING_LEASE_SECONDS` they may be reclaimed and reprocessed. Deterministic upserts make that retry safe. This is intentionally a practical lease, not a distributed lock: unusually long processing beyond the lease can overlap on two workers, but both write identical point IDs and only one final state is retained.

### Required worker environment

Add real values only to private `server/.env`:

```env
GEMINI_API_KEY=YOUR_PRIVATE_GEMINI_API_KEY
EMBEDDING_MODEL=gemini-embedding-2
EMBEDDING_DIMENSION=768
EMBEDDING_BATCH_SIZE=20

QDRANT_URL=https://YOUR_CLUSTER.cloud.qdrant.io
QDRANT_API_KEY=YOUR_PRIVATE_QDRANT_API_KEY
QDRANT_COLLECTION=resolveai_documents

DOCUMENT_PROCESSING_LEASE_SECONDS=240
```

The configured embedding dimension must match the existing Qdrant collection. Changing the model or dimension later requires an intentional collection migration; normal processing rejects an incompatible collection instead of destroying vectors.

### Recommended Qdrant Cloud setup

Qdrant Cloud is the simplest Phase 9 development choice because it requires no local daemon or Docker and is reachable by the worker wherever it runs. Local Qdrant offers offline development and lower latency, but you must operate the process and persist its data yourself.

1. Sign in at [Qdrant Cloud](https://cloud.qdrant.io/) and create a cluster in a nearby region.
2. Open the cluster, copy its HTTPS endpoint, and create an API key with data-plane access.
3. Put the endpoint and key in private `server/.env` as `QDRANT_URL` and `QDRANT_API_KEY`.
4. Leave `QDRANT_COLLECTION=resolveai_documents`. The worker creates it on first ingestion with Cosine distance and the configured vector size.
5. Never paste the key into source code, documentation, shared shell history, or Git.

For a local Qdrant instance, follow the [official Qdrant quickstart](https://qdrant.tech/documentation/quick-start/) for your preferred supported installation, expose its REST port `6333`, use `QDRANT_URL=http://127.0.0.1:6333`, and leave `QDRANT_API_KEY` blank. No Docker files are added to this repository in Phase 9.

### Gemini embedding setup

1. Open [Google AI Studio](https://aistudio.google.com/app/apikey) and create an API key in your own Google project.
2. Put it only in private `server/.env` as `GEMINI_API_KEY`.
3. Keep `EMBEDDING_MODEL=gemini-embedding-2` and `EMBEDDING_DIMENSION=768` unless you intentionally migrate the Qdrant collection too.
4. Review quota/billing for the selected Google project; provider rate limits are treated as transient and retried through SQS.

### Real Phase 9 verification

First ensure MySQL, the private S3 bucket, the SQS main queue/DLQ, Gemini, and Qdrant values are configured. Set the SQS visibility timeout to at least 300 seconds. Then run:

```bash
# Terminal 1: API
cd /Users/ranib/Desktop/ResolveAi/server
npm run dev

# Terminal 2: worker
cd /Users/ranib/Desktop/ResolveAi/server
npm run worker:documents

# Terminal 3: upload a real text document
printf 'ResolveAI refund policy\n\nRefunds are reviewed within five business days.\n' > /tmp/resolveai-phase9.txt
TOKEN='REPLACE_WITH_OWNER_OR_ADMIN_JWT'
curl -i -X POST http://localhost:5001/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@/tmp/resolveai-phase9.txt;type=text/plain'

# Poll the safe metadata endpoint; replace the ID returned by POST.
DOCUMENT_ID=REPLACE_WITH_DOCUMENT_ID
curl -s http://localhost:5001/api/documents/$DOCUMENT_ID \
  -H "Authorization: Bearer $TOKEN"
```

Expected progression is `PENDING` → `PROCESSING` → `READY`. In Qdrant Cloud, inspect `resolveai_documents` and verify the points have 768 values and the tenant-safe payload above. Also test a real text-based PDF. A scanned PDF should become `FAILED` because OCR is outside Phase 9.

Automated tests mock S3, Gemini, Qdrant, and SQS; they do not spend provider quota or modify cloud data. The optional MySQL integration test uses rollback-only fixtures and mocked external services. Real Phase 9 end-to-end behavior must be verified using the commands above and should not be claimed until completed.

## Tenant-safe RAG answers (Phase 10)

Phase 10 adds a stateless, authenticated knowledge-base endpoint:

```text
POST /api/ai/ask
  → JWT authentication and current MySQL membership/role
  → Gemini RETRIEVAL_QUERY embedding (same model and 768 dimensions as Phase 9)
  → Qdrant similarity query with organizationId filter inside Qdrant
  → one tenant-scoped MySQL query retaining only READY documents
  → bounded untrusted context
  → grounded Gemini generation
  → concise answer with chunk-level sources
```

OWNER, ADMIN, SUPPORT_AGENT, and VIEWER may use the endpoint because it is a read-only knowledge-base operation, matching existing document-read access. The organization always comes from `request.user.organizationId`; `organizationId` and every other unsupported request field are rejected.

### Request and response

The body must contain exactly one non-empty string question, trimmed and limited by `RAG_QUESTION_MAX_CHARS`:

```bash
TOKEN='REPLACE_WITH_A_VALID_JWT'

curl -i -X POST http://localhost:5001/api/ai/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"question":"How long do customers have to request a refund?"}'
```

Successful grounded response:

```json
{
  "success": true,
  "data": {
    "answer": "Customers may request a refund within 30 days.",
    "sources": [
      {
        "documentId": 39,
        "fileName": "refund-policy.pdf",
        "chunkIndex": 2
      }
    ]
  }
}
```

Responses never contain embeddings, vector database details, JWT contents, credentials, password hashes, or S3 storage keys.

### Retrieval and tenant isolation

The question uses Gemini's `RETRIEVAL_QUERY` task type while Phase 9 documents retain `RETRIEVAL_DOCUMENT`; both use the configured embedding model and dimension. Qdrant receives a hard server-controlled filter equivalent to `organizationId == request.user.organizationId` before similarity results are returned. There is no global search followed by application-only filtering.

The API defensively rejects any returned payload whose organization does not match. It then collects the candidate document IDs and performs one MySQL query constrained by all three conditions: candidate ID, authenticated `organizationId`, and `status=READY`. Missing metadata and PENDING, PROCESSING, or FAILED documents cannot contribute context. File names returned to clients come from current MySQL metadata rather than vector payloads.

Retrieval is limited to `RAG_TOP_K` (default 5) without an arbitrary score threshold. Duplicate document/chunk pairs are removed while preserving Qdrant relevance order. The complete formatted context is capped by `RAG_CONTEXT_MAX_CHARS` (default 6,000).

### Grounding and prompt-injection boundary

Generation defaults to the configurable stable `gemini-3.8-flash` model. A fixed system instruction requires answers to use only retrieved evidence and to report insufficient knowledge rather than use general knowledge. Retrieved chunks and the user's question are serialized as user-level data, separate from the system instruction.

Uploaded documents are always untrusted reference material. The system instruction explicitly tells Gemini to ignore role changes, secret requests, system-prompt requests, or behavioral commands appearing inside a document. Application secrets are never placed in the prompt. This is an important defense boundary, though model-level prompt-injection defenses are risk reduction rather than a mathematical guarantee.

If no validated chunks fit the context budget, Gemini generation is skipped and the API returns:

```json
{
  "success": true,
  "data": {
    "answer": "I couldn't find enough information in the available knowledge base to answer that question.",
    "sources": []
  }
}
```

Invalid requests return `400`, missing/invalid authentication returns `401`, and role rejection returns `403`. Missing configuration and temporary retrieval failures return `503`; Gemini embedding or generation failures return `502`. Provider errors are logged only by safe stage/error type and raw provider details are not returned.

### Phase 10 environment

Keep real values only in private `server/.env`:

```env
GEMINI_GENERATION_MODEL=gemini-3.8-flash
RAG_TOP_K=5
RAG_CONTEXT_MAX_CHARS=6000
RAG_QUESTION_MAX_CHARS=2000
```

Phase 10 reuses `GEMINI_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `QDRANT_URL`, `QDRANT_API_KEY`, and `QDRANT_COLLECTION`. No new package, Prisma model, or migration is required. The generation model default follows Google's current [Gemini model documentation](https://ai.google.dev/gemini-api/docs/models); the embedding task pairing follows the official [embeddings guidance](https://ai.google.dev/gemini-api/docs/embeddings).

### Controlled real-infrastructure verification

This test uses your existing MySQL, S3, SQS, worker, Gemini, and Qdrant configuration. It creates deliberately unique knowledge so the retrieved source is easy to recognize.

```bash
# Terminal 1: API
cd /Users/ranib/Desktop/ResolveAi/server
npm run dev

# Terminal 2: document worker
cd /Users/ranib/Desktop/ResolveAi/server
npm run worker:documents

# Terminal 3: create and upload controlled knowledge
printf '%s\n' \
  'ResolveAI Controlled Lunar Refund Policy' \
  '' \
  'Customers on the Lunar plan may request a refund within exactly 37 calendar days of purchase.' \
  'The request must include the original purchase email.' \
  > /tmp/resolveai-lunar-refund-policy.txt

TOKEN='REPLACE_WITH_OWNER_OR_ADMIN_JWT'

curl -i -X POST http://localhost:5001/api/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@/tmp/resolveai-lunar-refund-policy.txt;type=text/plain'
```

Copy the returned document ID, poll until its status is `READY`, then ask a semantic question:

```bash
DOCUMENT_ID='REPLACE_WITH_RETURNED_DOCUMENT_ID'

curl -s http://localhost:5001/api/documents/$DOCUMENT_ID \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:5001/api/ai/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is the Lunar plan refund deadline and what must the customer provide?"}'
```

The answer should state 37 calendar days and the original purchase email, and `sources` should identify `resolveai-lunar-refund-policy.txt`. To verify tenant isolation, ask with a valid JWT from another organization; it must not retrieve this document. Do not share either token.

Automated Phase 10 tests mock Gemini and Qdrant. They verify request validation, access policy, tenant-filter construction, cross-tenant payload rejection, READY filtering, missing metadata, source safety, bounded context, no-context behavior, provider failure handling, and malicious document instructions without spending cloud quota. Run the real steps above before claiming a Phase 10 cloud end-to-end test.

## Persistent AI conversations (Phase 11)

Phase 11 keeps `POST /api/ai/ask` backward compatible and adds persistent, creator-owned conversations:

```text
authenticated conversation message
  → tenant + creator scoped conversation lookup
  → bounded recent MySQL history
  → fresh Phase 10 RETRIEVAL_QUERY embedding
  → Qdrant search with the mandatory organizationId filter
  → tenant-scoped READY-document validation in MySQL
  → bounded retrieved context + untrusted bounded history
  → grounded Gemini answer
  → atomic USER + ASSISTANT message insert and conversation timestamp update
```

All four established read-only AI roles—OWNER, ADMIN, SUPPORT_AGENT, and VIEWER—may use these routes:

| Endpoint | Body | Result |
| --- | --- | --- |
| `POST /api/ai/conversations` | `{}` or `{ "title": "Refund questions" }` | Creates a conversation and returns `201` |
| `GET /api/ai/conversations` | none | Lists the authenticated user's conversations, `updatedAt DESC, id DESC`, without messages |
| `GET /api/ai/conversations/:conversationId` | none | Returns the conversation and up to the 100 most recent messages in chronological order |
| `POST /api/ai/conversations/:conversationId/messages` | `{ "question": "..." }` | Runs fresh grounded RAG, persists one message pair, and returns `201` with answer, sources, USER message, and ASSISTANT message |

Bodies accept only the documented fields. Clients cannot provide an organization, creator, message role, assistant content, context, sources, or system prompt. Titles are optional non-empty strings up to 191 characters. Questions use the existing `RAG_QUESTION_MAX_CHARS` validation.

### Tenant and conversation ownership

Organization and user identity come only from the current membership loaded by `authMiddleware`. Every conversation read or write uses the combination of `conversationId`, `request.user.organizationId`, and `request.user.userId`. A missing ID, another user's ID, and another tenant's ID all return the same `404 Conversation not found`, so the API does not reveal resource existence. Conversation lists are also filtered by both organization and creator.

This creator-owned policy means even an OWNER or ADMIN cannot inspect another member's AI conversation. The Qdrant query still applies the server-side integer `organizationId` payload filter required by Qdrant Cloud strict mode. Candidate vector payloads are defensively tenant-checked, and only READY documents from the same MySQL organization may reach generation.

### Bounded history, grounding, and persistence

Only the newest `AI_HISTORY_MAX_MESSAGES` messages are considered, and their combined content is capped by `AI_HISTORY_MAX_CHARS`. The default limits are 10 messages and 6,000 characters. Prior USER and ASSISTANT messages are serialized as untrusted user-level contextual data, separate from the trusted system instruction and clearly separate from the current question. History may clarify references, but retrieved READY knowledge remains the sole authority for company facts. Every turn performs fresh retrieval; memory never replaces Qdrant.

The trusted instruction explicitly rejects role changes, system-prompt requests, credential/API-key requests, tenant-isolation bypasses, and grounding overrides found in documents, history, or questions. Application credentials, JWTs, password hashes, S3 keys, vectors, and internal prompts are never selected into the generation payload or returned by the API. Prompt-injection defenses reduce risk but cannot mathematically guarantee model behavior.

Retrieval and generation complete before message persistence. On success, USER and ASSISTANT rows are inserted together in one MySQL transaction and the conversation's `updatedAt` is refreshed. If embedding, retrieval, or generation fails, neither message is stored. If the persistence transaction fails, it rolls back both rows. Source metadata remains response-only and is not duplicated in MySQL.

Expected errors follow existing conventions: `400` invalid input, `401` missing/invalid authentication, `403` unsupported role, `404` inaccessible conversation, `502` Gemini embedding/generation failure, `503` retrieval or configuration failure, and a generic `500` for unexpected persistence errors. Raw provider errors and secrets are never returned.

### Phase 11 environment and migration

Keep these values in private `server/.env`; the shown defaults are also in the safe `.env.example`:

```env
AI_HISTORY_MAX_MESSAGES=10
AI_HISTORY_MAX_CHARS=6000
```

`AI_HISTORY_MAX_MESSAGES` must be an integer from 1 through 50. `AI_HISTORY_MAX_CHARS` must be an integer from 500 through 50,000. Apply the new migration and regenerate Prisma Client before starting the API:

```bash
cd /Users/ranib/Desktop/ResolveAi/server
npx prisma migrate dev
npm run prisma:generate
npm run prisma:validate
npx prisma migrate status
```

The migration creates `AIConversation`, `AIMessage`, and the `AIMessageRole` enum represented in MySQL as `USER`/`ASSISTANT`, with tenant/creator, updated-time, and chronological-message indexes. Old migrations are unchanged.

### Real Phase 11 verification with the existing Lunar document

These commands use existing READY document `54`; do not upload it again. Start MySQL and the backend first. The worker is unnecessary when document 54 is already READY in MySQL and its vectors remain in Qdrant.

```bash
# Terminal 1
cd /Users/ranib/Desktop/ResolveAi/server
npm run dev

# Terminal 2
BASE_URL='http://localhost:5001/api'

# Use your real organization slug, email, and password. Copy data.token from the response.
curl -s -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"organizationSlug":"YOUR_ORG_SLUG","email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'

TOKEN='PASTE_DATA_TOKEN_HERE'

# Confirm document 54 is still READY for this tenant.
curl -s "$BASE_URL/documents/54" \
  -H "Authorization: Bearer $TOKEN"

# Create the conversation. Copy data.conversation.id from the response.
curl -s -X POST "$BASE_URL/ai/conversations" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Lunar refund follow-up"}'

CONVERSATION_ID='PASTE_CONVERSATION_ID_HERE'

# Expected: a grounded answer stating 37 calendar days and source documentId 54.
curl -s -X POST "$BASE_URL/ai/conversations/$CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is the Lunar plan refund deadline?"}'

# Same conversation. Expected: original purchase email and source documentId 54.
curl -s -X POST "$BASE_URL/ai/conversations/$CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"question":"What does the customer need to provide?"}'

# Expected chronological roles: USER, ASSISTANT, USER, ASSISTANT.
curl -s "$BASE_URL/ai/conversations/$CONVERSATION_ID" \
  -H "Authorization: Bearer $TOKEN"

# The list response must not include messages.
curl -s "$BASE_URL/ai/conversations" \
  -H "Authorization: Bearer $TOKEN"
```

Verify persistence in MySQL Workbench using the returned conversation ID:

```sql
SELECT id, organizationId, createdByUserId, title, createdAt, updatedAt
FROM AIConversation
WHERE id = YOUR_CONVERSATION_ID;

SELECT id, conversationId, role, content, createdAt
FROM AIMessage
WHERE conversationId = YOUR_CONVERSATION_ID
ORDER BY createdAt ASC, id ASC;
```

For a practical isolation check, log in as a user from a different organization, copy that JWT into `OTHER_TENANT_TOKEN`, and request the first tenant's ID. Both calls must return `404` without conversation data:

```bash
OTHER_TENANT_TOKEN='PASTE_OTHER_TENANT_JWT_HERE'

curl -i "$BASE_URL/ai/conversations/$CONVERSATION_ID" \
  -H "Authorization: Bearer $OTHER_TENANT_TOKEN"

curl -i -X POST "$BASE_URL/ai/conversations/$CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $OTHER_TENANT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"question":"Do not reveal another tenant conversation"}'
```

Automated tests mock Gemini, Qdrant, S3, and SQS where appropriate. The rollback-only integration test requires migrated local MySQL. Known Phase 11 limitations: no pagination cursor beyond the safe 100-message detail limit, no source persistence, no retry idempotency key, no concurrent-turn serialization, no deletion/renaming endpoint, and no streaming/WebSockets.

## Production support dashboard (Phase 12)

Phase 12 replaces the original health-check screen with a responsive authenticated workspace. Its support-intake extension adds one deliberately public, narrowly scoped endpoint while preserving all authenticated backend routes, database models, and Phase 13 boundaries.

### Frontend architecture

```text
client/src/
├── api/          # one fetch client plus domain-specific API modules
├── components/   # shared controls, feedback states, and application shell
├── constants/    # role and ticket display metadata
├── context/      # reducer-based authentication and toast state
├── features/     # auth, public support, dashboard, tickets, customers, knowledge, AI, and team pages
├── hooks/        # context access hooks
├── test/         # Vitest and Testing Library setup
└── utils/        # date, name, and text formatting helpers
```

The centralized API client attaches the stored Bearer token, accepts `AbortSignal`, handles JSON and `FormData`, normalizes safe API errors, and publishes one unauthorized event for `401` responses. The auth reducer owns token restoration through `GET /api/auth/me`, session persistence, login, registration, and logout. A protected route blocks application screens until restoration completes; public auth routes redirect an already authenticated user.

Major pages are lazy-loaded with `React.lazy` and `Suspense`. Lists, derived dashboard statistics, navigation metadata, and context values use memoization where it avoids repeated work. Page requests are cancelled during cleanup, repeated form submissions are guarded, and route/error/loading/empty states have dedicated UI.

### Routes and access-aware navigation

| Frontend route | Purpose |
| --- | --- |
| `/login` | Organization-aware sign in |
| `/register` | Create an organization and its first owner |
| `/support/:organizationSlug` | Public customer support intake without the internal application shell |
| `/app/dashboard` | Ticket overview and recent activity derived from the ticket list |
| `/app/tickets` | Filter, inspect, create, and update tickets |
| `/app/tickets/:ticketId` | Ticket detail, assignment/status editing, and conversation messages |
| `/app/customers` | Search, list, and create customers |
| `/app/customers/:customerId` | Customer profile and related tickets |
| `/app/knowledge` | Document list, upload, processing status, and failure visibility |
| `/app/ai` and `/app/ai/:conversationId` | Persistent grounded AI conversations |
| `/app/team` | Organization member list and owner-only role editing |

The UI reflects the backend's role policy rather than inventing new authorization rules. OWNER and ADMIN users receive team and document-management controls; only OWNER can change member roles. OWNER, ADMIN, and SUPPORT_AGENT can create or modify support records. VIEWER receives read-only support pages while retaining the existing read-only AI access. The API remains the final authority for every action.

### Knowledge and AI behavior

Knowledge uploads accept PDF or plain-text files up to 10 MB before sending multipart data. Documents in `PENDING` or `PROCESSING` are refreshed every five seconds with a non-overlapping timer. Polling stops when no documents are in progress, after two minutes, or when the page unmounts. Terminal `READY` and `FAILED` states remain visible; the current API intentionally exposes status but no internal failure details.

Each document row also has a secure Preview action. Plain text is rendered as escaped text and PDFs use the browser's built-in PDF viewer backed by a short-lived browser object URL that is revoked on close or unmount. Preview bytes come from the authenticated, organization-scoped API endpoint; private S3 keys and URLs remain server-side.

The AI workspace lists creator-owned conversations, loads persisted chronological messages, creates conversations, and sends one guarded question at a time. Each response is rendered as plain React text, never injected HTML. Source cards are shown for the current response because Phase 11 intentionally does not persist sources. The most recently selected conversation ID is kept in session storage for convenient same-tab navigation.

### Loading, feedback, and performance decisions

Major list/detail surfaces use shape-matched skeletons so the page structure stays stable while data loads. Reusable empty and error states provide context and retry actions. A separate reducer-backed toast provider handles bounded success, error, warning, and informational notices, while form-specific failures remain inline. Toast timers and in-flight page requests are cleaned up when their owners unmount.

Repeated list rows and message items use `React.memo`; filtered lists, dashboard counts, polling state, and role-aware navigation use `useMemo`; callbacks are stabilized only when they are passed to memoized children or form part of an effect dependency. This keeps the high-density screens efficient without blanket memoization. Major pages are split into separate production chunks.

The only client environment variable is `VITE_API_BASE_URL`. Leave it blank during local development to use Vite's `/api` proxy to port 5001, or set it to the deployed API origin. It is a public build-time value and must never contain a credential.

### Frontend verification

Run these inside `client/`:

```bash
npm test
npm run build
npm audit
```

The focused test suite covers centralized API behavior and auth headers, protected-route redirects, role-aware navigation, upload validation and polling decisions, plus successful and failed AI message interactions. No browser end-to-end framework is introduced in this phase.

### Manual Phase 12 test flow

1. Start local MySQL and apply existing migrations if needed: `cd server && npx prisma migrate dev`.
2. Start the API in one terminal: `cd server && npm run dev`.
3. Start the SQS document worker in another terminal: `cd server && npm run worker:documents`.
4. Start the frontend in a third terminal: `cd client && npm run dev`, then open `http://localhost:5173`.
5. Register a new organization or sign in with an existing organization slug and account; refresh a protected page and confirm `/api/auth/me` restores the session.
6. Open the dashboard, customers, and tickets. Create a customer and ticket, open the ticket, update supported properties, and send a message as OWNER, ADMIN, or SUPPORT_AGENT.
7. Open Knowledge as OWNER or ADMIN, upload one `.txt` or text-based `.pdf` file smaller than 10 MB, and watch `PENDING` progress through `PROCESSING` to `READY` (or show `FAILED`). Confirm unsupported and oversized files are rejected before upload, then use Preview and verify the private text or PDF opens in the modal.
8. Open AI Assistant, create a conversation, ask a question grounded in the READY document, and ask a follow-up. Confirm the latest sources are shown and the conversation persists after refresh.
9. As OWNER, edit a team member role. Confirm ADMIN can view and add members but cannot change roles; confirm SUPPORT_AGENT and VIEWER do not receive team navigation.
10. Log out and confirm protected routes return to `/login`. Repeat key flows with a VIEWER account and at a narrow/mobile viewport, including keyboard navigation, modal focus containment, Escape-to-close, visible focus styles, loading states, empty states, and error recovery.

Known Phase 12 limitations follow the current API: lists are bounded only by backend responses because no pagination contract exists; dashboard metrics are client-derived snapshots rather than analytics; historical AI sources cannot be displayed because sources are response-only; document status uses bounded polling rather than push events; JWT storage remains browser local storage because Phase 12 preserves the existing token architecture; and AI responses are non-streaming. No delete operations are shown because the backend exposes none.

## Customer Support Intake (Phase 12 extension)

Customers can submit a support request at:

```text
http://localhost:5173/support/ORGANIZATION_SLUG
```

The frontend sends exactly `name`, `email`, `subject`, and `message` to:

```http
POST /api/public/support/:organizationSlug/tickets
```

This endpoint is intentionally unauthenticated. It does not alter or bypass authentication on `/api/customers`, `/api/tickets`, `/api/tickets/:ticketId/messages`, or any other private route.

### Organization resolution and tenant safety

The URL uses the existing unique, normalized Organization `slug`, which is already used during login and is appropriate as the public workspace identifier. The server validates the slug and resolves the Organization inside the database transaction. Public clients cannot provide `organizationId`, `customerId`, assignment, status, priority, role, user identity, or any additional field; unsupported fields receive a safe `400` response.

Email is normalized to lowercase and customer resolution uses the existing compound uniqueness rule `(organizationId, email)`. A matching customer in the resolved tenant is reused. The same email in a different tenant is unrelated and cannot be reused or exposed.

### Atomic customer, ticket, and message creation

One Prisma transaction performs the complete intake operation:

```text
validated organization slug
  → resolve Organization server-side
  → upsert Customer by organizationId + normalized email
  → create OPEN / MEDIUM / unassigned Ticket
  → create CUSTOMER Message linked to that Customer and Ticket
  → return a safe display reference
```

The submitted message is used as the ticket description for compatibility with the existing ticket UI and is also stored as the first real conversation message. That message has `senderType=CUSTOMER`, its tenant-scoped `customerId`, and no staff `userId`. Existing staff replies continue to use `senderType=SUPPORT_AGENT`. The schema already supports these relationships, so this extension requires no Prisma schema change or migration.

If customer, ticket, or message creation fails, the transaction commits none of them. The public response contains only the ticket reference, subject, status, and priority; it does not expose tenant IDs, customer IDs, assignment data, authentication information, or internal metadata. The numeric ticket ID is used only as a display reference because no unauthenticated ticket lookup endpoint exists.

### Public form and agent workflow

The public page has no internal sidebar or staff navigation. It provides controlled, labelled Name, Email, Subject, and “How can we help?” fields, client-side validation, server-authoritative validation, a 10,000-character message limit, single-flight submission, abort cleanup, inline errors, and a confirmation containing the ticket reference. It remains independent of staff authentication, including when a staff user is already signed in.

The created ticket is returned by the existing authenticated ticket list. Opening it through `/app/tickets/:ticketId` loads the initial CUSTOMER message through the existing message API, and an authorized staff user replies through the unchanged support-agent message flow.

### Security and abuse-protection limitation

The endpoint accepts untrusted internet input and strictly bounds every field. Organization identity comes only from the resolved slug, and all writes carry the resolved database tenant ID. Raw database/provider errors are never returned. No Gemini call or automatic response occurs; AI remains an internal staff tool.

This phase intentionally does not add Redis or distributed rate limiting. Before public production exposure, deploy edge/API abuse controls such as request throttling, bot protection, and monitoring. The current endpoint is suitable for local verification and architecture integration, not unrestricted internet exposure without those controls.

### Manual customer-to-agent verification

1. Start MySQL, then run `cd server && npx prisma migrate status`.
2. Start the API with `cd server && npm run dev`.
3. Start the frontend with `cd client && npm run dev`.
4. Open `http://localhost:5173/support/YOUR_ORGANIZATION_SLUG`.
5. Submit Rahul Sharma, `rahul@example.com`, subject `Refund not received`, and message `I returned my order 10 days ago but still haven't received my refund.`
6. Record the successful ticket reference.
7. Sign in as an authorized staff user, open Tickets, and find the new ticket.
8. Open it and verify Rahul's message appears as a CUSTOMER message, then send a staff reply and refresh to confirm persistence.
9. Submit another public request with `rahul@example.com` and confirm MySQL contains one Customer for that organization/email but two Tickets.

## Google Sign-In and authentication hardening (Phase 13)

Phase 13 adds Google as an identity provider without making Google authoritative for ResolveAI access. Email/password registration and login remain available and unchanged at their existing endpoints.

### Authentication architecture

The two authentication paths converge on the same ResolveAI session:

```text
Password + organization slug ──→ ResolveAI User ──┐
                                                  ├─→ ResolveAI JWT ─→ existing AuthContext/RBAC
Google ID token ─→ verified Google sub ─→ mapping ┘
```

The browser receives a Google-issued ID token in the `credential` callback from Google Identity Services and sends only that credential to `POST /api/auth/google`. The API verifies its signature, issuer, expiry, and intended audience with Google's official Node.js authentication library. ResolveAI then uses the verified Google `sub` claim to find an `AuthIdentity`, reloads the linked `User` and `Organization` from MySQL, and issues the same application JWT used by password login.

Google proves identity only. It never supplies or controls a ResolveAI user ID, organization, role, or permission. Protected requests continue through the existing Bearer-token middleware, which reloads current organization membership and role from MySQL on every request. `/api/auth/me` also remains database-authoritative.

No Google access token or refresh token is requested or stored. ResolveAI does not request Gmail, Drive, Calendar, Contacts, or other Google API access.

### Identity mapping and account-linking policy

`AuthIdentity` stores `userId`, `provider`, and the stable provider subject. Database uniqueness on `(provider, providerSubject)` prevents one Google account from mapping to multiple users, and uniqueness on `(userId, provider)` prevents one user from acquiring multiple Google mappings. Deleting a user cascades to its identity mapping.

The exact Google policy is:

1. If the verified Google `sub` is already linked, ResolveAI authenticates that linked user. Later Google email/profile changes do not remap the account.
2. If the `sub` is new, ResolveAI uses the verified, normalized Google email only for a guarded first-time link.
3. Automatic linking occurs only when exactly one ResolveAI user across all organizations has that email and that user has no other Google identity.
4. Zero matches, multiple cross-tenant matches, and an existing different Google identity all return the same safe `GOOGLE_ACCOUNT_NOT_LINKED` state. ResolveAI does not reveal match counts or tenant details.
5. Unknown Google users are not created, assigned to an organization, or granted a role. Google login never creates an organization.
6. Uniqueness races fail closed with `GOOGLE_ACCOUNT_LINK_CONFLICT`; the API never guesses a mapping.

An OWNER/ADMIN-created team member can therefore keep using their temporary password and start using Google by selecting a Google account whose verified email exactly matches that member and is unambiguous across ResolveAI. The original MySQL organization and role remain unchanged. If the same email exists in more than one tenant, password login continues to work but automatic Google linking is refused; there is intentionally no explicit administrator-approved linking UI in Phase 13.

### Validation and hardening

The Google endpoint accepts exactly one field:

```json
{ "credential": "GOOGLE_ISSUED_ID_TOKEN" }
```

Extra fields such as `organizationId`, `userId`, `role`, or `permissions` are rejected before provider verification or database access. Invalid, expired, wrong-audience, and malformed Google credentials share one safe authentication failure. Raw provider errors and credentials are not logged or returned. The normal password response remains generic for unknown organizations, unknown emails, and wrong passwords, and a dummy bcrypt comparison reduces account-existence timing differences.

JWTs remain HS256-signed with a minimum 32-character secret, explicit algorithm verification, and configured expiry. Although the token contains tenant and role claims, authorization does not trust a stale role claim: middleware refreshes the current user, tenant membership, and role from MySQL. Removed users immediately lose access.

Phase 13 deliberately retains the existing Bearer JWT in `localStorage`. Moving to HttpOnly cookies safely would also require a complete CSRF policy, production-aware `SameSite`/`Secure` behavior, credentialed CORS, and coordinated client/server migration. A partial cookie migration would be less safe. The remaining XSS/token-theft risk means production must use a restrictive CSP, careful dependency hygiene, and no unsafe HTML injection; a full session-cookie design remains future work.

### Environment variables

Use the same Web application client ID on both sides:

`server/.env`:

```env
GOOGLE_CLIENT_ID=1234567890-example.apps.googleusercontent.com
```

`client/.env`:

```env
VITE_GOOGLE_CLIENT_ID=1234567890-example.apps.googleusercontent.com
```

`VITE_GOOGLE_CLIENT_ID` is intentionally browser-public. An OAuth client ID is an identifier, not a secret. This implementation does not use an OAuth client secret, so do not place one in either frontend configuration or source control. Real `.env` files remain ignored; only placeholder `.env.example` files are tracked.

### Exact Google Auth Platform setup

This implementation uses the Google Identity Services JavaScript button in popup mode with a JavaScript callback. It does not use a redirect callback and therefore needs no Authorized redirect URI.

1. Open the [Google Auth Platform / Clients page](https://console.cloud.google.com/auth/clients) and select or create the intended Google Cloud project.
2. Configure the Auth Platform branding and audience. While the app is in testing, add the Google accounts that should be allowed as test users if Google requires it for the selected audience.
3. Create a client with application type **Web application**.
4. Add both local development origins under **Authorized JavaScript origins**:
   - `http://localhost`
   - `http://localhost:5173`
5. Add the real HTTPS frontend origin separately when deploying, for example `https://app.example.com`. Origins contain scheme, hostname, and optional port, but no path.
6. Leave **Authorized redirect URIs** empty for this flow because the JavaScript popup returns the ID token to the configured callback.
7. Copy the Web client ID into both environment variables above. Do not copy the client secret into ResolveAI.
8. Restart both Vite and Express after changing environment variables.

These steps match Google's [GIS setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [JavaScript button flow](https://developers.google.com/identity/gsi/web/guides/display-button), and [server-side ID-token verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token). The local Vite server supplies `Cross-Origin-Opener-Policy: same-origin-allow-popups` for browsers that are not using FedCM, and the page uses Google's recommended local-development referrer policy. If production adds CSP, allow the GIS script, frame, style, and connection origins described in Google's setup guide.

### Migration and startup

The new migration only creates `AuthIdentity`; it does not alter or delete existing users, passwords, organizations, or roles.

```bash
cd server
npm install
npx prisma validate
npx prisma generate
npx prisma migrate dev
npm run dev
```

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Do not reset the database. For controlled production deployment, review the migration and apply committed migrations with `npx prisma migrate deploy` through the normal release process.

### Real manual verification

**Test A — password authentication**

1. Leave the existing organization slug, email, and password fields populated and sign in normally.
2. Confirm the dashboard and role-aware navigation load.
3. In the browser console, run the following same-origin check without printing the token:

   ```js
   fetch("/api/auth/me", {
     headers: { Authorization: `Bearer ${localStorage.getItem("resolveai.session.token")}` },
   }).then((response) => response.json()).then(console.log)
   ```

4. Confirm the returned user, organization, and role are correct, then log out.

**Test B — Google authentication**

1. Complete the Google setup and environment configuration above and restart both processes.
2. Open `http://localhost:5173/login`; the official **Continue with Google** control should appear below the password form.
3. Select an account whose verified email safely maps under the policy above.
4. Confirm dashboard access, inspect `/api/auth/me` using the same console command, refresh to verify session restoration, and log out.

**Test C — existing team member**

1. As OWNER/ADMIN, create a member with their real Google email, temporary password, and intended non-owner role.
2. Ensure that email does not belong to another ResolveAI user in a different tenant.
3. Log out and use Google with that exact email. Confirm `/api/auth/me` reports the original organization and original role.
4. Log out and verify the temporary-password path still works.

**Test D — unknown or ambiguous Google user**

1. Select a Google account with no ResolveAI user, or an email represented in multiple tenants.
2. Confirm the login page shows “No ResolveAI account is linked to this Google account.”
3. Confirm no organization/user/identity was created and no dashboard access or OWNER privilege was granted.

**Test E — tenant and privilege escalation**

Automated tests submit `organizationId`, `userId`, `role`, and `permissions` alongside a credential and require `400`. For a manual check, use the browser Network panel to copy the `/api/auth/google` request as a development-only request, add one of those fields, and verify it is rejected. Never share or commit the short-lived Google credential shown in developer tools.

### Phase 13 verification and limitations

Run:

```bash
cd server
npm test
npm run prisma:validate
npm run prisma:generate
npx prisma migrate status
npm audit

cd ../client
npm test
npm run build
npm audit
```

Normal tests inject the Google verification boundary and never contact Google. The rollback-only integration suite remains opt-in with `RUN_DB_TESTS=1 npm run test:integration` and requires local MySQL with the new migration applied.

Known limitations: real Google login cannot be verified until a real Web client ID and allowed Google account are configured; there is no explicit link/unlink or administrator-approval screen; unknown Google users cannot register with Google; logout clears the ResolveAI session but does not revoke the user's Google account consent; JWTs remain in localStorage; and rate limiting/production deployment controls remain outside Phase 13.

## 3. Configure the frontend

Open a second terminal:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. During development, Vite proxies `/api` requests to the backend on port `5001`.

For a separately hosted API, set `VITE_API_BASE_URL` in `client/.env` to the API origin. The client adds `/api` when needed:

```env
VITE_API_BASE_URL=https://api.example.com
```

## Available scripts

Run these inside `client/`:

- `npm run dev` starts Vite's development server.
- `npm run build` creates a production frontend build.
- `npm run preview` previews the production build locally.
- `npm test` runs the frontend regression tests once.
- `npm run test:watch` runs frontend tests in watch mode.

Run these inside `server/`:

- `npm run dev` starts the API with nodemon and restarts it when server files change.
- `npm start` starts the API normally.
- `npm run worker:documents` runs the standalone long-polling SQS document worker.
- `npm test` runs Message, Document, ingestion, queue/worker, Phase 10 RAG, and Phase 11 conversation tests without real database or cloud writes.
- `npm run test:integration` runs rollback-only local MySQL/API regression tests with mocked external services, including authenticated Phase 10 and Phase 11 HTTP contracts.
- `npm run prisma:generate` regenerates Prisma Client after schema changes.
- `npm run prisma:validate` checks the Prisma schema and configuration.
