import assert from "node:assert/strict";
import { test } from "node:test";
import { createPublicSupportTicket } from "../src/controllers/publicSupportController.js";
import { authMiddleware } from "../src/middleware/authMiddleware.js";
import {
  submitPublicSupportRequest,
  validatePublicSupportInput,
} from "../src/services/publicSupportService.js";

const validInput = {
  name: "Rahul Sharma",
  email: "rahul@example.com",
  subject: "Refund not received",
  message: "I returned my order 10 days ago but still haven't received my refund.",
};

function fakeDatabase({ customers = [], failMessage = false } = {}) {
  const state = {
    organizations: [
      { id: 4, slug: "resolveai" },
      { id: 9, slug: "other-company" },
    ],
    customers: structuredClone(customers),
    tickets: [],
    messages: [],
  };
  const calls = { transactions: 0, customerCreates: 0 };
  let nextCustomerId = 100;
  let nextTicketId = 500;

  const database = {
    async $transaction(callback) {
      calls.transactions += 1;
      const staged = structuredClone(state);
      const transaction = {
        organization: {
          findUnique: async ({ where }) => (
            staged.organizations.find(({ slug }) => slug === where.slug) || null
          ),
        },
        customer: {
          upsert: async ({ where, create }) => {
            const key = where.organizationId_email;
            let customer = staged.customers.find((item) => (
              item.organizationId === key.organizationId && item.email === key.email
            ));
            if (!customer) {
              customer = { id: nextCustomerId++, ...create };
              staged.customers.push(customer);
              calls.customerCreates += 1;
            }
            return { id: customer.id };
          },
        },
        ticket: {
          create: async ({ data }) => {
            const ticket = { id: nextTicketId++, ...data };
            staged.tickets.push(ticket);
            return ticket;
          },
        },
        message: {
          create: async ({ data }) => {
            if (failMessage) throw new Error("synthetic message failure");
            const message = { id: staged.messages.length + 1, ...data };
            staged.messages.push(message);
            return message;
          },
        },
      };

      const result = await callback(transaction);
      Object.assign(state, staged);
      return result;
    },
  };

  return { database, state, calls };
}

test("public support intake validation rejects malformed and privileged input", async () => {
  const invalidInputs = [
    [{ ...validInput, email: "not-an-email" }, "valid email"],
    [{ ...validInput, subject: "   " }, "subject is required"],
    [{ ...validInput, message: "" }, "message is required"],
    [{ ...validInput, name: "a".repeat(192) }, "name must not exceed"],
    [{ ...validInput, subject: "a".repeat(256) }, "subject must not exceed"],
    [{ ...validInput, message: "a".repeat(10_001) }, "message must not exceed"],
    [{ ...validInput, organizationId: 99 }, "Unsupported field: organizationId"],
    [{ ...validInput, assignedToId: 1 }, "Unsupported field: assignedToId"],
    [{ ...validInput, status: "CLOSED" }, "Unsupported field: status"],
  ];

  for (const [input, expectedMessage] of invalidInputs) {
    assert.throws(
      () => validatePublicSupportInput(input),
      (error) => error.statusCode === 400 && error.message.includes(expectedMessage),
    );
  }

  const database = { $transaction: async () => assert.fail("invalid input must not query MySQL") };
  await assert.rejects(
    submitPublicSupportRequest("resolveai", { ...validInput, customerId: 1 }, database),
    (error) => error.statusCode === 400,
  );
  await assert.rejects(
    submitPublicSupportRequest("../resolveai", validInput, database),
    (error) => error.statusCode === 400,
  );
});

test("valid intake creates a tenant-safe customer, ticket, and initial CUSTOMER message", async () => {
  const { database, state } = fakeDatabase();
  const result = await submitPublicSupportRequest("ResolveAI", {
    ...validInput,
    name: "  Rahul Sharma  ",
    email: "  RAHUL@example.com ",
    subject: "  Refund not received  ",
  }, database);

  assert.deepEqual(result, {
    ticket: {
      reference: "500",
      subject: "Refund not received",
      status: "OPEN",
      priority: "MEDIUM",
    },
  });
  assert.deepEqual(state.customers, [{
    id: 100,
    organizationId: 4,
    name: "Rahul Sharma",
    email: "rahul@example.com",
  }]);
  assert.deepEqual(state.tickets[0], {
    id: 500,
    organizationId: 4,
    customerId: 100,
    assignedToId: null,
    subject: validInput.subject,
    description: validInput.message,
    status: "OPEN",
    priority: "MEDIUM",
  });
  assert.deepEqual(state.messages[0], {
    id: 1,
    organizationId: 4,
    ticketId: 500,
    senderType: "CUSTOMER",
    userId: null,
    customerId: 100,
    content: validInput.message,
  });
  assert.equal(JSON.stringify(result).includes("organizationId"), false);
  assert.equal(JSON.stringify(result).includes("customerId"), false);
});

test("customer reuse is scoped to the resolved organization", async () => {
  const sameTenant = fakeDatabase({
    customers: [{ id: 41, organizationId: 4, name: "Existing Rahul", email: "rahul@example.com" }],
  });
  await submitPublicSupportRequest("resolveai", validInput, sameTenant.database);
  assert.equal(sameTenant.calls.customerCreates, 0);
  assert.equal(sameTenant.state.tickets[0].customerId, 41);
  assert.equal(sameTenant.state.messages[0].customerId, 41);

  const otherTenantOnly = fakeDatabase({
    customers: [{ id: 91, organizationId: 9, name: "Other Rahul", email: "rahul@example.com" }],
  });
  await submitPublicSupportRequest("resolveai", validInput, otherTenantOnly.database);
  assert.equal(otherTenantOnly.calls.customerCreates, 1);
  assert.equal(otherTenantOnly.state.customers.length, 2);
  assert.equal(otherTenantOnly.state.customers[1].organizationId, 4);
  assert.notEqual(otherTenantOnly.state.tickets[0].customerId, 91);
});

test("unknown organizations fail safely and a message failure commits no partial writes", async () => {
  const unknown = fakeDatabase();
  await assert.rejects(
    submitPublicSupportRequest("missing-company", validInput, unknown.database),
    (error) => error.statusCode === 404 && error.message === "Support page not found",
  );
  assert.equal(unknown.state.customers.length, 0);
  assert.equal(unknown.state.tickets.length, 0);

  const failed = fakeDatabase({ failMessage: true });
  await assert.rejects(
    submitPublicSupportRequest("resolveai", validInput, failed.database),
    /synthetic message failure/,
  );
  assert.equal(failed.state.customers.length, 0);
  assert.equal(failed.state.tickets.length, 0);
  assert.equal(failed.state.messages.length, 0);
});

test("public controller needs no JWT while private-route authentication remains protected", async () => {
  const fixture = fakeDatabase();
  const publicResult = {};
  const publicResponse = {
    status(code) { publicResult.status = code; return this; },
    json(body) { publicResult.body = body; return this; },
  };
  await createPublicSupportTicket({
    params: { organizationSlug: "resolveai" },
    body: validInput,
    app: { locals: { publicSupportDatabase: fixture.database } },
  }, publicResponse);
  assert.equal(publicResult.status, 201);
  assert.equal(publicResult.body.success, true);
  assert.equal(publicResult.body.data.ticket.reference, "500");

  const privateResult = {};
  const privateResponse = {
    status(code) { privateResult.status = code; return this; },
    json(body) { privateResult.body = body; return this; },
  };
  await authMiddleware({ get: () => undefined }, privateResponse, () => assert.fail("must not continue"));
  assert.equal(privateResult.status, 401);
  assert.equal(privateResult.body.message, "Authentication required");
});
