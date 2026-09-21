# ResolveAI

ResolveAI is an AI-powered customer support platform under active development. Through Phase 9, it includes a React/Express foundation, a multi-tenant MySQL schema with Prisma, JWT authentication, role-protected organization management, Customer/Ticket APIs, ticket conversations, private S3 uploads, asynchronous SQS jobs, and document ingestion into Qdrant using Gemini embeddings.

## Project structure

```text
ResolveAi/
├── client/   # React + Vite frontend
└── server/   # Node.js + Express API
```

Question answering, retrieval APIs, grounded response generation, Redis, and advanced ticket workflows are intentionally not implemented yet. Phase 9 builds the vector knowledge base only; it does not implement RAG retrieval or AI answers.

## Planned future stack

The following technologies describe the planned stack. React/Express, local MySQL/Prisma, JWT authentication, organization-level RBAC, Customer/Ticket/Message APIs, private S3 storage, SQS document jobs, Gemini embeddings, and Qdrant indexing are configured through Phase 9:

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
QDRANT_URL=https://YOUR_CLUSTER.cloud.qdrant.io
QDRANT_API_KEY=YOUR_QDRANT_API_KEY
QDRANT_COLLECTION=resolveai_documents
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

POST accepts exactly one `multipart/form-data` field named `file`. PDF (`application/pdf`) and UTF-8 plain text (`text/plain`) are supported, up to 10 MB. Empty, oversized, unsupported, and content-type-spoofed files are rejected. The authenticated organization—not request body data—controls ownership.

S3 privately stores the file bytes; MySQL stores safe metadata with status `PENDING`, then SQS requests Phase 9 ingestion. Keys are generated as `organizations/{authenticatedOrganizationId}/documents/{UUID}-{sanitizedFilename}`. No public-read ACL is set and API responses do not reveal the storage key.

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
- `npm run worker:documents` runs the standalone long-polling SQS document worker.
- `npm test` runs Message, Document, ingestion-service, SQS producer, and worker tests without real database or cloud writes.
- `npm run test:integration` runs rollback-only local MySQL/API regression tests with mocked external services.
- `npm run prisma:generate` regenerates Prisma Client after schema changes.
- `npm run prisma:validate` checks the Prisma schema and configuration.
