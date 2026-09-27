import assert from "node:assert/strict";
import { test } from "node:test";
import { authMiddleware } from "../src/middleware/authMiddleware.js";
import { authorizeRoles } from "../src/middleware/authorizeRoles.js";
import { RagServiceError } from "../src/services/ragService.js";
import {
  AIConversationServiceError,
  boundConversationHistory,
  createAIConversation,
  getAIConversation,
  listAIConversations,
  sendAIConversationMessage,
} from "../src/services/aiConversationService.js";

const identity = { userId: 9, organizationId: 7, role: "SUPPORT_AGENT" };

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function memoryDatabase(seed = {}) {
  const state = {
    conversations: structuredClone(seed.conversations ?? []),
    messages: structuredClone(seed.messages ?? []),
  };
  let nextConversationId = Math.max(0, ...state.conversations.map(({ id }) => id)) + 1;
  let nextMessageId = Math.max(0, ...state.messages.map(({ id }) => id)) + 1;
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, clock++));
  const matches = (value, where) => Object.entries(where).every(([key, expected]) => value[key] === expected);
  const select = (value, fields) => Object.fromEntries(
    Object.keys(fields).filter((key) => fields[key] === true).map((key) => [key, value[key]]),
  );
  const sortRows = (rows, orderBy) => rows.sort((left, right) => {
    for (const rule of orderBy ?? []) {
      const [field, direction] = Object.entries(rule)[0];
      const comparison = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0;
      if (comparison) return direction === "asc" ? comparison : -comparison;
    }
    return 0;
  });
  const database = {
    state,
    aIConversation: {
      async create({ data, select: fields }) {
        const now = stamp();
        const value = { id: nextConversationId++, ...data, createdAt: now, updatedAt: now };
        state.conversations.push(value);
        return select(value, fields);
      },
      async findFirst({ where, select: fields }) {
        const value = state.conversations.find((row) => matches(row, where));
        return value ? select(value, fields) : null;
      },
      async findMany({ where, select: fields, orderBy }) {
        return sortRows(state.conversations.filter((row) => matches(row, where)), orderBy)
          .map((row) => select(row, fields));
      },
      async update({ where, data, select: fields }) {
        const value = state.conversations.find((row) => matches(row, where));
        if (!value) throw new Error("missing conversation");
        Object.assign(value, data);
        return select(value, fields);
      },
    },
    aIMessage: {
      async create({ data, select: fields }) {
        const value = { id: nextMessageId++, ...data, createdAt: stamp() };
        state.messages.push(value);
        return select(value, fields);
      },
      async findMany({ where, select: fields, orderBy, take }) {
        return sortRows(state.messages.filter((row) => matches(row, where)), orderBy)
          .slice(0, take)
          .map((row) => select(row, fields));
      },
    },
  };
  database.$transaction = async (callback) => {
    const snapshot = structuredClone(state);
    try {
      return await callback(database);
    } catch (error) {
      state.conversations.splice(0, state.conversations.length, ...snapshot.conversations);
      state.messages.splice(0, state.messages.length, ...snapshot.messages);
      throw error;
    }
  };
  return database;
}

function conversation(id = 21, overrides = {}) {
  return {
    id,
    organizationId: 7,
    createdByUserId: 9,
    title: "Refund policy",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("Phase 11 conversation access, input validation, and ownership", async (context) => {
  await context.test("requires authentication and permits all established read-only AI roles", () => {
    const response = responseRecorder();
    let nextCalled = false;
    authMiddleware({ get: () => undefined }, response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 401);
    assert.equal(nextCalled, false);

    const authorize = authorizeRoles("OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER");
    for (const role of ["OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER"]) {
      let permitted = false;
      authorize({ user: { role } }, responseRecorder(), () => { permitted = true; });
      assert.equal(permitted, true);
    }
  });

  await context.test("creates from authenticated identity and rejects unsupported fields", async () => {
    const database = memoryDatabase();
    const created = await createAIConversation(identity, { title: "  Refund questions  " }, { database });
    assert.equal(created.organizationId, 7);
    assert.equal(created.createdByUserId, 9);
    assert.equal(created.title, "Refund questions");

    const untitled = await createAIConversation(identity, {}, { database });
    assert.equal(untitled.title, null);
    const noBody = await createAIConversation(identity, undefined, { database });
    assert.equal(noBody.title, null);
    for (const body of [null, [], { title: "" }, { title: 4 }, { organizationId: 999 }, { title: "ok", userId: 1 }]) {
      await assert.rejects(
        createAIConversation(identity, body, { database }),
        (error) => error instanceof AIConversationServiceError && error.statusCode === 400,
      );
    }
  });

  await context.test("lists only the authenticated user's tenant conversations newest first", async () => {
    const database = memoryDatabase({ conversations: [
      conversation(1, { updatedAt: new Date("2026-01-01") }),
      conversation(2, { updatedAt: new Date("2026-02-01") }),
      conversation(3, { organizationId: 8, updatedAt: new Date("2026-03-01") }),
      conversation(4, { createdByUserId: 10, updatedAt: new Date("2026-04-01") }),
    ] });
    assert.deepEqual((await listAIConversations(identity, { database })).map(({ id }) => id), [2, 1]);
  });

  await context.test("returns chronological messages and hides cross-tenant or cross-user IDs", async () => {
    const database = memoryDatabase({
      conversations: [conversation(), conversation(22, { organizationId: 8 }), conversation(23, { createdByUserId: 10 })],
      messages: [
        { id: 3, conversationId: 21, role: "ASSISTANT", content: "third", createdAt: new Date("2026-01-03") },
        { id: 1, conversationId: 21, role: "USER", content: "first", createdAt: new Date("2026-01-01") },
        { id: 2, conversationId: 21, role: "ASSISTANT", content: "second", createdAt: new Date("2026-01-02") },
      ],
    });
    const result = await getAIConversation(identity, "21", { database });
    assert.deepEqual(result.messages.map(({ content }) => content), ["first", "second", "third"]);
    assert.equal(result.messageLimit, 100);

    for (const id of ["0", "bad", "1.5", "2147483648"]) {
      await assert.rejects(getAIConversation(identity, id, { database }), (error) => error.statusCode === 400);
    }
    for (const id of ["22", "23", "999"]) {
      await assert.rejects(
        getAIConversation(identity, id, { database }),
        (error) => error instanceof AIConversationServiceError && error.statusCode === 404,
      );
    }
  });
});

test("bounded history and persistent grounded turns", async (context) => {
  await context.test("keeps only recent messages within both limits", () => {
    const history = boundConversationHistory([
      { role: "USER", content: "old" },
      { role: "ASSISTANT", content: "12345" },
      { role: "USER", content: "67890" },
    ], 2, 7);
    assert.deepEqual(history, [
      { role: "ASSISTANT", content: "12" },
      { role: "USER", content: "67890" },
    ]);
    assert.equal(history.reduce((sum, item) => sum + item.content.length, 0), 7);
  });

  await context.test("performs fresh RAG work and atomically persists exactly one message pair", async () => {
    const database = memoryDatabase({
      conversations: [conversation()],
      messages: [
        { id: 1, conversationId: 21, role: "USER", content: "What is the deadline?", createdAt: new Date("2026-01-01") },
        { id: 2, conversationId: 21, role: "ASSISTANT", content: "37 days", createdAt: new Date("2026-01-02") },
      ],
    });
    const calls = [];
    const dependencies = {
      database,
      historyConfig: { maxMessages: 2, maxChars: 500 },
      ragDependencies: { config: { questionMaxChars: 200 } },
      answerKnowledgeQuestion: async (receivedIdentity, body, _ragDependencies, options) => {
        calls.push({ receivedIdentity, body, history: options.history });
        return {
          answer: "The customer must provide the original purchase email.",
          sources: [{ documentId: 54, fileName: "lunar-refund.txt", chunkIndex: 0 }],
        };
      },
    };
    const result = await sendAIConversationMessage(
      identity,
      "21",
      { question: "  What does the customer need to provide?  " },
      dependencies,
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].receivedIdentity, identity);
    assert.deepEqual(calls[0].history, [
      { role: "USER", content: "What is the deadline?" },
      { role: "ASSISTANT", content: "37 days" },
    ]);
    assert.equal(calls[0].body.question, "What does the customer need to provide?");
    assert.equal(result.userMessage.role, "USER");
    assert.equal(result.assistantMessage.role, "ASSISTANT");
    assert.deepEqual(result.sources, [{ documentId: 54, fileName: "lunar-refund.txt", chunkIndex: 0 }]);
    assert.equal(database.state.messages.length, 4);

    await sendAIConversationMessage(identity, "21", { question: "And the deadline?" }, dependencies);
    assert.equal(calls.length, 2, "each message must perform a fresh RAG call");
    assert.equal(database.state.messages.length, 6);
    assert.equal(database.state.messages.filter(({ role }) => role === "USER").length, 3);
    assert.equal(database.state.messages.filter(({ role }) => role === "ASSISTANT").length, 3);
  });

  await context.test("rejects invalid bodies before retrieval", async () => {
    const database = memoryDatabase({ conversations: [conversation()] });
    let ragCalls = 0;
    const dependencies = {
      database,
      historyConfig: { maxMessages: 10, maxChars: 6000 },
      ragDependencies: { config: { questionMaxChars: 100 } },
      answerKnowledgeQuestion: async () => { ragCalls++; },
    };
    for (const body of [{}, { question: "" }, { question: 3 }, { question: "valid", role: "ASSISTANT" }, { question: "x".repeat(101) }]) {
      await assert.rejects(
        sendAIConversationMessage(identity, "21", body, dependencies),
        (error) => error instanceof RagServiceError && error.statusCode === 400,
      );
    }
    assert.equal(ragCalls, 0);
    assert.equal(database.state.messages.length, 0);
  });

  await context.test("stores no USER or ASSISTANT message when generation fails", async () => {
    const database = memoryDatabase({ conversations: [conversation()] });
    await assert.rejects(
      sendAIConversationMessage(identity, "21", { question: "What is the policy?" }, {
        database,
        historyConfig: { maxMessages: 10, maxChars: 6000 },
        ragDependencies: { config: { questionMaxChars: 200 } },
        answerKnowledgeQuestion: async () => {
          throw new RagServiceError(502, "Unable to generate a grounded answer", "generation");
        },
      }),
      (error) => error instanceof RagServiceError && error.statusCode === 502,
    );
    assert.deepEqual(database.state.messages, []);
  });
});
