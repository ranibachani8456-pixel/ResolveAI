import assert from "node:assert/strict";
import { test } from "node:test";
import prisma from "../src/config/prisma.js";
import { createMessage, listMessages } from "../src/services/messageService.js";

test("message validation and query contracts without database writes", async (context) => {
  const originals = {
    findTicket: prisma.ticket.findFirst,
    findMessages: prisma.message.findMany,
    transaction: prisma.$transaction,
  };
  const identity = { organizationId: 10, userId: 20 };
  const is400 = (error) => error.statusCode === 400;
  try {
    await context.test("invalid IDs and content return 400 before database access", async () => {
      prisma.ticket.findFirst = () => assert.fail("invalid input must not query MySQL");
      for (const id of ["0", "-1", "1.5", "abc", "1e2", "2147483648", "9007199254740993", "", undefined]) {
        await assert.rejects(listMessages(10, id), is400);
        await assert.rejects(createMessage(identity, id, { content: "hello" }), is400);
      }
      for (const content of [undefined, null, 123, [], {}, "", "  ", "a".repeat(65_536), "😀".repeat(16_384)]) {
        await assert.rejects(createMessage(identity, "1", { content }), is400);
      }
    });
    await context.test("listing scopes the ticket and messages and orders deterministically", async () => {
      prisma.ticket.findFirst = async (query) => {
        assert.deepEqual(query.where, { id: 1, organizationId: 10 });
        return { id: 1 };
      };
      prisma.message.findMany = async (query) => {
        assert.deepEqual(query.where, { organizationId: 10, ticketId: 1 });
        assert.deepEqual(query.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
        assert.equal(JSON.stringify(query.select).includes("passwordHash"), false);
        return [];
      };
      assert.deepEqual(await listMessages(10, "1"), []);
      prisma.ticket.findFirst = async () => null;
      await assert.rejects(listMessages(10, "1"), (error) => error.statusCode === 404);
    });
    await context.test("identity cannot be overridden; exact TEXT byte boundary is accepted", async () => {
      prisma.$transaction = async (callback) => callback({
        ticket: { findFirst: async () => ({ id: 1 }) },
        message: { create: async ({ data }) => data },
      });
      const message = await createMessage(identity, "1", {
        content: " hello ", organizationId: 999, userId: 999, ticketId: 999,
        customerId: 999, senderType: "AI",
      });
      assert.deepEqual(message, {
        organizationId: 10, ticketId: 1, userId: 20, content: "hello",
        senderType: "SUPPORT_AGENT", customerId: null,
      });
      const boundary = "😀".repeat(16_383) + "abc";
      assert.equal(Buffer.byteLength(boundary), 65_535);
      assert.equal((await createMessage(identity, "1", { content: boundary })).content, boundary);
      prisma.$transaction = async (callback) => callback({ ticket: { findFirst: async () => null } });
      await assert.rejects(createMessage(identity, "1", { content: "hello" }), (error) => error.statusCode === 404);
    });
  } finally {
    prisma.ticket.findFirst = originals.findTicket;
    prisma.message.findMany = originals.findMessages;
    prisma.$transaction = originals.transaction;
    await prisma.$disconnect();
  }
});
