import assert from "node:assert/strict";
import { test } from "node:test";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import prisma from "../src/config/prisma.js";
import { env } from "../src/config/env.js";
import { MAX_DOCUMENT_SIZE_BYTES } from "../src/utils/documentLimits.js";
import { getDocument, listDocuments, uploadDocument } from "../src/services/documentService.js";

const textFile = (overrides = {}) => ({
  originalname: "notes.txt",
  mimetype: "text/plain",
  buffer: Buffer.from("ResolveAI knowledge"),
  ...overrides,
});

test("document service validation, tenancy, S3 coordination and safe metadata", async (context) => {
  const original = {
    create: prisma.document.create,
    findMany: prisma.document.findMany,
    findFirst: prisma.document.findFirst,
    region: env.awsRegion,
  };
  env.awsRegion = "us-east-1";
  try {
    await context.test("rejects invalid IDs without querying MySQL", async () => {
      prisma.document.findFirst = () => assert.fail("invalid IDs must not query MySQL");
      for (const id of ["0", "-1", "1.5", "1e2", "abc", "", "2147483648", "9007199254740993", undefined]) {
        await assert.rejects(getDocument(7, id), (error) => error.statusCode === 400);
      }
    });

    await context.test("rejects missing, empty, oversized, unsupported and spoofed files", async () => {
      const storage = { bucket: "test-bucket", client: { send: () => assert.fail("invalid files must not reach S3") } };
      const invalid = [
        undefined,
        textFile({ buffer: Buffer.alloc(0) }),
        textFile({ buffer: Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES + 1) }),
        textFile({ mimetype: "image/png" }),
        textFile({ mimetype: "application/pdf", originalname: "fake.pdf", buffer: Buffer.from("not pdf") }),
        textFile({ buffer: Buffer.from([0xff, 0xfe]) }),
        textFile({ buffer: Buffer.from([65, 0, 66]) }),
      ];
      for (const file of invalid) {
        await assert.rejects(uploadDocument(7, file, storage), (error) => [400, 413].includes(error.statusCode));
      }
    });

    await context.test("listing and lookup are tenant scoped with safe deterministic selections", async () => {
      prisma.document.findMany = async (query) => {
        assert.deepEqual(query.where, { organizationId: 7 });
        assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
        assert.equal(query.select.storageKey, undefined);
        return [];
      };
      assert.deepEqual(await listDocuments(7), []);
      prisma.document.findFirst = async (query) => {
        assert.deepEqual(query.where, { id: 2, organizationId: 7 });
        assert.equal(query.select.storageKey, undefined);
        return null;
      };
      await assert.rejects(getDocument(7, "2"), (error) => error.statusCode === 404);
    });

    await context.test("server generates a tenant key and stores only trusted metadata", async () => {
      let putInput;
      const client = { send: async (command) => {
        assert.ok(command instanceof PutObjectCommand);
        putInput = command.input;
      } };
      prisma.document.create = async (query) => {
        assert.equal(query.data.organizationId, 7);
        assert.equal(query.data.status, "PENDING");
        assert.equal(query.data.fileName, "escape report.txt");
        assert.equal(query.data.storageKey, putInput.Key);
        assert.equal(query.select.storageKey, undefined);
        return { id: 1, organizationId: 7, fileName: query.data.fileName, mimeType: query.data.mimeType, status: "PENDING" };
      };
      const result = await uploadDocument(7, textFile({ originalname: "../../escape report.txt" }), { bucket: "private-bucket", client });
      assert.match(putInput.Key, /^organizations\/7\/documents\/[0-9a-f-]+-escape-report\.txt$/);
      assert.equal(putInput.Key.includes(".."), false);
      assert.equal(putInput.Bucket, "private-bucket");
      assert.equal(putInput.ACL, undefined);
      assert.equal(result.storageKey, undefined);
    });

    await context.test("S3 failure does not create metadata", async () => {
      prisma.document.create = () => assert.fail("failed S3 upload must not create metadata");
      const client = { send: async () => { throw new Error("synthetic upload failure"); } };
      await assert.rejects(uploadDocument(7, textFile(), { bucket: "test-bucket", client }), (error) => error.statusCode === 502);
    });

    await context.test("database failure attempts cleanup and hides internal errors", async () => {
      const commands = [];
      const client = { send: async (command) => commands.push(command) };
      prisma.document.create = async () => { throw new Error("synthetic database failure"); };
      await assert.rejects(
        uploadDocument(7, textFile(), { bucket: "test-bucket", client }),
        (error) => error.statusCode === 500 && error.message === "Unable to save document metadata",
      );
      assert.ok(commands[0] instanceof PutObjectCommand);
      assert.ok(commands[1] instanceof DeleteObjectCommand);
      assert.equal(commands[0].input.Key, commands[1].input.Key);
    });
  } finally {
    prisma.document.create = original.create;
    prisma.document.findMany = original.findMany;
    prisma.document.findFirst = original.findFirst;
    env.awsRegion = original.region;
    await prisma.$disconnect();
  }
});
