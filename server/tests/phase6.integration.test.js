import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import app from "../src/app.js";
import prisma from "../src/config/prisma.js";
import s3Client from "../src/config/s3.js";
import sqsClient from "../src/config/sqs.js";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { env } from "../src/config/env.js";
import { signJwt } from "../src/utils/jwt.js";
import { processDocumentJob } from "../src/services/documentProcessingService.js";

// Opt-in: temporary fixtures use real MySQL, but every write is rolled back.
test("Phase 0–9 API regression with rollback-only MySQL fixtures and mocked external services", {
  skip: process.env.RUN_DB_TESTS !== "1", timeout: 90_000,
}, async () => {
  const models = ["organization", "user", "customer", "ticket", "message", "document"];
  const counts = () => Promise.all(models.map((name) => prisma[name].count()));
  const before = await counts();
  const rollback = new Error("Intentional fixture rollback");
  const originalTransaction = prisma.$transaction.bind(prisma);
  const originalS3Send = s3Client.send;
  const originalSqsSend = sqsClient.send;
  const originalRegion = env.awsRegion;
  const originalBucket = env.awsS3Bucket;
  const originalQueueUrl = env.awsSqsDocumentQueueUrl;
  const saved = [];
  let httpServer;
  try {
    try {
      await originalTransaction(async (transaction) => {
        const suffix = randomUUID();
        const org = await transaction.organization.create({ data: { name: "Phase 6 test", slug: `phase6-${suffix}` } });
        const otherOrg = await transaction.organization.create({ data: { name: "Other test tenant", slug: `other-${suffix}` } });
        const password = "Phase6-Only-Test-Password";
        const passwordHash = await bcrypt.hash(password, 4);
        const members = {};
        for (const role of ["OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER"]) {
          members[role] = await transaction.user.create({ data: {
            organizationId: org.id, name: role, email: `${role.toLowerCase()}@phase6.invalid`, passwordHash, role,
          } });
        }
        const otherUser = await transaction.user.create({ data: {
          organizationId: otherOrg.id, name: "Other owner", email: "other@phase6.invalid", passwordHash, role: "OWNER",
        } });
        const customer = await transaction.customer.create({ data: { organizationId: org.id, name: "Test customer", email: "customer@phase6.invalid" } });
        const otherCustomer = await transaction.customer.create({ data: { organizationId: otherOrg.id, name: "Other customer", email: "customer@phase6.invalid" } });
        const ticket = await transaction.ticket.create({ data: { organizationId: org.id, customerId: customer.id, subject: "Test ticket", description: "Rollback-only fixture" } });
        const otherTicket = await transaction.ticket.create({ data: { organizationId: otherOrg.id, customerId: otherCustomer.id, subject: "Other ticket", description: "Rollback-only fixture" } });
        const document = await transaction.document.create({ data: { organizationId: org.id, fileName: "existing.txt", mimeType: "text/plain", storageKey: `organizations/${org.id}/documents/existing.txt` } });
        const otherDocument = await transaction.document.create({ data: { organizationId: otherOrg.id, fileName: "other.txt", mimeType: "text/plain", storageKey: `organizations/${otherOrg.id}/documents/other.txt` } });
        // Route all app queries into this single uncommitted transaction during this test.
        for (const name of models) {
          for (const method of ["findFirst", "findUnique", "findMany", "create", "update", "updateMany", "deleteMany", "count"]) {
            saved.push([prisma[name], method, prisma[name][method]]);
            prisma[name][method] = transaction[name][method].bind(transaction[name]);
          }
        }
        saved.push([prisma, "$transaction", prisma.$transaction], [prisma, "$queryRaw", prisma.$queryRaw]);
        prisma.$transaction = (callback) => callback(transaction);
        prisma.$queryRaw = transaction.$queryRaw.bind(transaction);
        env.awsRegion = "us-east-1";
        env.awsS3Bucket = "phase7-test-bucket";
        env.awsSqsDocumentQueueUrl = "https://sqs.example/resolveai-document-processing";
        const s3Commands = [];
        const sqsCommands = [];
        s3Client.send = async (command) => { s3Commands.push(command); return {}; };
        sqsClient.send = async (command) => { sqsCommands.push(command); return { MessageId: "mock-message" }; };
        httpServer = app.listen(0, "127.0.0.1");
        await once(httpServer, "listening");
        const base = `http://127.0.0.1:${httpServer.address().port}/api`;
        const tokens = Object.fromEntries(Object.entries(members).map(([role, user]) => [role, signJwt({ userId: user.id, organizationId: org.id, role })]));
        const otherToken = signJwt({ userId: otherUser.id, organizationId: otherOrg.id, role: "OWNER" });
        let assertions = 0;
        async function request(path, expectedStatus, token, method = "GET", body) {
          const response = await fetch(`${base}${path}`, {
            method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          });
          const result = await response.json();
          assert.equal(response.status, expectedStatus, `${method} ${path}: ${JSON.stringify(result)}`);
          assert.equal(JSON.stringify(result).includes("passwordHash"), false);
          assertions++;
          return result;
        }
        async function upload(expectedStatus, token, file, fields = {}) {
          const form = new FormData();
          for (const [name, value] of Object.entries(fields)) form.append(name, String(value));
          if (file) form.append("file", file.blob, file.name);
          const response = await fetch(`${base}/documents`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
          });
          const result = await response.json();
          assert.equal(response.status, expectedStatus, `POST /documents: ${JSON.stringify(result)}`);
          assert.equal(JSON.stringify(result).includes("storageKey"), false);
          assertions++;
          return result;
        }
        const path = `/tickets/${ticket.id}/messages`;
        await request("/health", 200);
        await request("/db-health", 200);
        const loggedIn = await request("/auth/login", 200, undefined, "POST", { organizationSlug: org.slug, email: members.OWNER.email, password });
        await request("/auth/me", 200, loggedIn.data.token);
        await request("/auth/login", 401, undefined, "POST", { organizationSlug: org.slug, email: members.OWNER.email, password: "wrong" });
        await request("/auth/register", 400, undefined, "POST", {});
        const registered = await request("/auth/register", 201, undefined, "POST", {
          organizationName: "Registration test", organizationSlug: `register-${suffix}`,
          name: "Registered owner", email: "registered@phase6.invalid", password,
        });
        await request("/auth/me", 200, registered.data.token);
        await request(path, 401);
        await request("/documents", 401);
        await request(path, 401, "invalid-token");
        await request(path, 401, signJwt({ userId: 2_147_483_647, organizationId: org.id, role: "OWNER" }));
        for (const role of Object.keys(members)) {
          await request("/auth/me", 200, tokens[role]);
          await request("/organization", 200, tokens[role]);
          await request("/organization/users", ["OWNER", "ADMIN"].includes(role) ? 200 : 403, tokens[role]);
          await request("/customers", 200, tokens[role]);
          await request(`/customers/${customer.id}`, 200, tokens[role]);
          await request("/tickets?status=OPEN&priority=MEDIUM", 200, tokens[role]);
          await request(`/tickets/${ticket.id}`, 200, tokens[role]);
          await request(path, 200, tokens[role]);
          await request("/documents", 200, tokens[role]);
          await request(`/documents/${document.id}`, 200, tokens[role]);
          await request(path, role === "VIEWER" ? 403 : 201, tokens[role], "POST", {
            content: `  ${role} message  `, organizationId: otherOrg.id, userId: otherUser.id,
            ticketId: otherTicket.id, customerId: otherCustomer.id, senderType: "AI",
          }).then((result) => {
            if (role !== "VIEWER") {
              const message = result.data.message;
              assert.equal(message.organizationId, org.id);
              assert.equal(message.userId, members[role].id);
              assert.equal(message.ticketId, ticket.id);
              assert.equal(message.senderType, "SUPPORT_AGENT");
              assert.equal(message.customerId, null);
              assert.equal(message.content, `${role} message`);
            }
          });
        }
        const textUpload = { name: "../../tenant/notes.txt", blob: new Blob(["Phase 7 text"], { type: "text/plain" }) };
        for (const role of ["OWNER", "ADMIN"]) {
          const uploaded = await upload(201, tokens[role], textUpload, { organizationId: otherOrg.id });
          assert.equal(uploaded.data.document.organizationId, org.id);
          assert.equal(uploaded.data.document.status, "PENDING");
          assert.equal(uploaded.data.document.storageKey, undefined);
        }
        for (const role of ["SUPPORT_AGENT", "VIEWER"]) await upload(403, tokens[role], textUpload);
        await upload(400, tokens.OWNER);
        await upload(400, tokens.OWNER, { name: "empty.txt", blob: new Blob([], { type: "text/plain" }) });
        await upload(400, tokens.OWNER, { name: "image.png", blob: new Blob(["not an image"], { type: "image/png" }) });
        await upload(400, tokens.OWNER, { name: "fake.pdf", blob: new Blob(["not pdf"], { type: "application/pdf" }) });
        await upload(413, tokens.OWNER, { name: "large.txt", blob: new Blob([Buffer.alloc(10 * 1024 * 1024 + 1, 65)], { type: "text/plain" }) });
        await request(`/documents/${otherDocument.id}`, 404, tokens.OWNER);
        await request("/documents/2147483647", 404, tokens.OWNER);
        await request("/documents/invalid", 400, tokens.OWNER);
        assert.ok(s3Commands.length >= 2);
        for (const command of s3Commands) {
          assert.match(command.input.Key, new RegExp(`^organizations/${org.id}/documents/[0-9a-f-]+-notes\\.txt$`));
          assert.equal(command.input.ACL, undefined);
        }
        assert.equal(sqsCommands.length, 2);
        for (const command of sqsCommands) {
          assert.ok(command instanceof SendMessageCommand);
          assert.equal(command.input.QueueUrl, env.awsSqsDocumentQueueUrl);
          const body = JSON.parse(command.input.MessageBody);
          assert.equal(body.organizationId, org.id);
          assert.deepEqual(Object.keys(body).sort(), ["documentId", "organizationId", "type", "version"]);
          assert.equal(command.input.MessageBody.includes("storageKey"), false);
        }
        const ingestionDependencies = {
          downloadDocument: async () => Buffer.from("Phase 9 integration knowledge"),
          extractDocumentText: async (_document, buffer) => buffer.toString(),
          chunkDocumentText: (text) => [{ chunkIndex: 0, text }],
          embedTexts: async () => [[1, 0, 0]],
          upsertDocumentVectors: async () => {},
        };
        assert.deepEqual(
          await processDocumentJob(
            { documentId: document.id, organizationId: org.id },
            transaction,
            ingestionDependencies,
          ),
          { outcome: "COMPLETED", status: "READY", chunkCount: 1 },
        );
        assert.equal(
          (await transaction.document.findFirst({ where: { id: document.id, organizationId: org.id } })).status,
          "READY",
        );
        assert.deepEqual(
          await processDocumentJob(
            { documentId: document.id, organizationId: org.id },
            transaction,
            ingestionDependencies,
          ),
          { outcome: "ALREADY_READY", status: "READY" },
        );
        assert.deepEqual(
          await processDocumentJob(
            { documentId: otherDocument.id, organizationId: org.id },
            transaction,
            ingestionDependencies,
          ),
          { outcome: "MISSING", status: null },
        );
        for (const status of ["READY", "FAILED"]) {
          const statusDocument = await transaction.document.create({
            data: { organizationId: org.id, fileName: `${status}.txt`, mimeType: "text/plain", status },
          });
          const result = await processDocumentJob(
            { documentId: statusDocument.id, organizationId: org.id },
            transaction,
            ingestionDependencies,
          );
          assert.equal(result.status, status);
          assert.equal((await transaction.document.findUnique({ where: { id: statusDocument.id } })).status, status);
        }
        const documentsBeforeS3Failure = await transaction.document.count({ where: { organizationId: org.id } });
        s3Client.send = async () => { throw new Error("synthetic S3 failure"); };
        await upload(502, tokens.OWNER, textUpload);
        assert.equal(await transaction.document.count({ where: { organizationId: org.id } }), documentsBeforeS3Failure);
        s3Client.send = async (command) => { s3Commands.push(command); return {}; };
        const documentsBeforeQueueFailure = await transaction.document.count({ where: { organizationId: org.id } });
        sqsClient.send = async () => { throw new Error("synthetic SQS failure"); };
        await upload(502, tokens.OWNER, textUpload);
        assert.equal(await transaction.document.count({ where: { organizationId: org.id } }), documentsBeforeQueueFailure);
        assert.ok(s3Commands.at(-1) instanceof DeleteObjectCommand);
        sqsClient.send = async (command) => { sqsCommands.push(command); return { MessageId: "mock-message" }; };
        for (const id of ["0", "-1", "1.5", "bad", "2147483648", "9007199254740993"]) {
          await request(`/tickets/${id}/messages`, 400, tokens.OWNER);
          await request(`/tickets/${id}/messages`, 400, tokens.OWNER, "POST", { content: "hello" });
        }
        for (const content of [null, 5, "", "  ", "a".repeat(65_536), "😀".repeat(16_384)]) {
          await request(path, 400, tokens.OWNER, "POST", { content });
        }
        await request(path, 400, tokens.OWNER, "POST", {});
        for (const target of [otherTicket.id, 2_147_483_647]) {
          await request(`/tickets/${target}/messages`, 404, tokens.OWNER);
          await request(`/tickets/${target}/messages`, 404, tokens.OWNER, "POST", { content: "hello" });
        }
        await request(path, 404, otherToken);
        await request(path, 404, otherToken, "POST", { content: "hello" });
        // Deliberately insert timestamps out of order, including a tie.
        for (const [content, createdAt] of [["tie-first", "2020-01-01"], ["earliest", "2019-01-01"], ["tie-second", "2020-01-01"]]) {
          await transaction.message.create({ data: { organizationId: org.id, ticketId: ticket.id, senderType: "SYSTEM", content, createdAt: new Date(createdAt) } });
        }
        const listed = (await request(path, 200, tokens.VIEWER)).data.messages;
        assert.deepEqual(listed.slice(0, 3).map((message) => message.content), ["earliest", "tie-first", "tie-second"]);
        for (let index = 1; index < listed.length; index++) {
          const previous = listed[index - 1], current = listed[index];
          assert.ok(previous.createdAt < current.createdAt || (previous.createdAt === current.createdAt && previous.id < current.id));
        }
        const boundary = "😀".repeat(16_383) + "abc";
        assert.equal((await request(path, 201, tokens.OWNER, "POST", { content: boundary })).data.message.content, boundary);
        // A signed but stale OWNER token must use the member's current VIEWER role.
        const staleToken = signJwt({ userId: members.VIEWER.id, organizationId: org.id, role: "OWNER" });
        await request(path, 403, staleToken, "POST", { content: "blocked" });
        await request("/customers", 403, tokens.VIEWER, "POST", {});
        await request(`/tickets/${ticket.id}`, 403, tokens.VIEWER, "PATCH", { status: "CLOSED" });
        await request(`/customers/${otherCustomer.id}`, 404, tokens.OWNER);
        await request(`/tickets/${otherTicket.id}`, 404, tokens.OWNER);
        await request("/tickets", 404, tokens.OWNER, "POST", { customerId: otherCustomer.id, subject: "Invalid tenant", description: "Must reject" });
        await request(`/tickets/${ticket.id}`, 404, tokens.OWNER, "PATCH", { assignedToId: otherUser.id });
        await request(`/tickets/${ticket.id}`, 200, tokens.OWNER, "PATCH", { assignedToId: members.SUPPORT_AGENT.id });
        await request("/tickets/9007199254740993", 400, tokens.OWNER);
        await request(`/organization/users/${members.OWNER.id}/role`, 409, tokens.OWNER, "PATCH", { role: "VIEWER" });
        const newMember = await request("/organization/users", 201, tokens.OWNER, "POST", {
          name: "New member", email: "new@phase6.invalid", password, role: "VIEWER",
        });
        await request(`/organization/users/${newMember.data.user.id}/role`, 200, tokens.OWNER, "PATCH", { role: "SUPPORT_AGENT" });
        await request(`/organization/users/${otherUser.id}/role`, 404, tokens.OWNER, "PATCH", { role: "VIEWER" });
        const newCustomer = await request("/customers", 201, tokens.OWNER, "POST", { name: "Created customer", email: "created@phase6.invalid" });
        await request(`/customers/${newCustomer.data.customer.id}`, 200, tokens.OWNER, "PATCH", { name: "Updated customer" });
        const newTicket = await request("/tickets", 201, tokens.OWNER, "POST", {
          customerId: newCustomer.data.customer.id, subject: "Created ticket", description: "Test description",
        });
        await request(`/tickets/${newTicket.data.ticket.id}`, 200, tokens.ADMIN, "PATCH", { status: "RESOLVED" });
        // Verify actual role demotion and account removal invalidate old privileges.
        await transaction.user.update({ where: { id: members.ADMIN.id }, data: { role: "VIEWER" } });
        await request(path, 403, tokens.ADMIN, "POST", { content: "stale ADMIN role" });
        await transaction.user.delete({ where: { id: newMember.data.user.id } });
        await request(path, 401, signJwt({ userId: newMember.data.user.id, organizationId: org.id, role: "OWNER" }));
        console.log(`Verified ${assertions} real HTTP responses plus identity, tenancy, upload, cleanup, byte-boundary, ordering and safe-field assertions.`);
        throw rollback;
      }, { maxWait: 10_000, timeout: 60_000 });
      assert.fail("fixture transaction must roll back");
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      for (const [object, key, original] of saved.reverse()) object[key] = original;
      s3Client.send = originalS3Send;
      sqsClient.send = originalSqsSend;
      env.awsRegion = originalRegion;
      env.awsS3Bucket = originalBucket;
      env.awsSqsDocumentQueueUrl = originalQueueUrl;
      if (httpServer) await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    }
    assert.deepEqual(await counts(), before, "all fixture writes must be rolled back");
  } finally {
    s3Client.send = originalS3Send;
    sqsClient.send = originalSqsSend;
    env.awsRegion = originalRegion;
    env.awsS3Bucket = originalBucket;
    env.awsSqsDocumentQueueUrl = originalQueueUrl;
    await prisma.$disconnect();
  }
});
