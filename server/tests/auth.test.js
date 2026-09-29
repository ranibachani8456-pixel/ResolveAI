import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import prisma from "../src/config/prisma.js";
import { env } from "../src/config/env.js";
import {
  getCurrentUser,
  login,
  loginWithGoogle,
  register,
} from "../src/services/authService.js";
import {
  GoogleCredentialError,
  GoogleIdentityConfigurationError,
  verifyGoogleCredential,
} from "../src/services/googleIdentityService.js";
import { authMiddleware } from "../src/middleware/authMiddleware.js";
import { authorizeRoles } from "../src/middleware/authorizeRoles.js";
import { signJwt } from "../src/utils/jwt.js";
import { loginGoogleUser } from "../src/controllers/authController.js";

const organization = { id: 4, name: "ResolveAI", slug: "resolveai" };
const user = {
  id: 12,
  organizationId: organization.id,
  name: "Riya",
  email: "riya@example.com",
  role: "SUPPORT_AGENT",
  organization,
};

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("Phase 13 password, Google identity, tenant, and RBAC authentication", async (context) => {
  const original = {
    organizationFindUnique: prisma.organization.findUnique,
    userFindUnique: prisma.user.findUnique,
    userFindFirst: prisma.user.findFirst,
    userFindMany: prisma.user.findMany,
    authIdentityFindUnique: prisma.authIdentity.findUnique,
    authIdentityCreate: prisma.authIdentity.create,
    transaction: prisma.$transaction,
    jwtSecret: env.jwtSecret,
    jwtExpiresIn: env.jwtExpiresIn,
    bcryptRounds: env.bcryptRounds,
  };
  env.jwtSecret = "phase-13-test-secret-that-is-at-least-32-characters";
  env.jwtExpiresIn = "1h";
  env.bcryptRounds = 4;

  try {
    await context.test("existing password login, registration, and current-user lookup still work", async () => {
      const password = "Existing-password-13";
      const passwordHash = await bcrypt.hash(password, 4);
      prisma.organization.findUnique = async () => organization;
      prisma.user.findUnique = async () => ({ ...user, passwordHash });

      const loggedIn = await login({
        organizationSlug: organization.slug,
        email: user.email,
        password,
      });
      assert.equal(loggedIn.user.role, "SUPPORT_AGENT");
      assert.equal(loggedIn.organization.id, organization.id);
      assert.ok(loggedIn.token);

      prisma.organization.findUnique = async () => null;
      prisma.$transaction = async (callback) => callback({
        organization: { create: async () => organization },
        user: { create: async ({ data }) => {
          assert.notEqual(data.passwordHash, password);
          return { ...user, role: "OWNER" };
        } },
      });
      const registered = await register({
        organizationName: organization.name,
        organizationSlug: organization.slug,
        name: user.name,
        email: user.email,
        password,
      });
      assert.equal(registered.user.role, "OWNER");
      assert.ok(registered.token);

      prisma.user.findFirst = async (query) => {
        assert.deepEqual(query.where, { id: user.id, organizationId: organization.id });
        return { ...user };
      };
      assert.equal((await getCurrentUser({
        userId: user.id, organizationId: user.organizationId,
      })).role, "SUPPORT_AGENT");
    });

    await context.test("linked Google sub authenticates with current MySQL tenant and role", async () => {
      const transaction = {
        authIdentity: {
          findUnique: async (query) => {
            assert.deepEqual(query.where.provider_providerSubject, {
              provider: "GOOGLE", providerSubject: "google-sub-12",
            });
            return { user };
          },
        },
        user: { findMany: () => assert.fail("linked identities must not relink by email") },
      };
      prisma.$transaction = async (callback) => callback(transaction);
      const result = await loginWithGoogle(
        { credential: "signed-google-id-token" },
        { verifyGoogleCredential: async (credential) => {
          assert.equal(credential, "signed-google-id-token");
          return { providerSubject: "google-sub-12", email: "changed@example.com" };
        } },
      );
      assert.equal(result.user.id, user.id);
      assert.equal(result.user.organizationId, organization.id);
      assert.equal(result.user.role, "SUPPORT_AGENT");
      assert.deepEqual(result.organization, organization);
      assert.equal(JSON.stringify(result).includes("google-sub-12"), false);
    });

    await context.test("one verified email match links an existing team member without changing role", async () => {
      let createdIdentity;
      const transaction = {
        authIdentity: {
          findUnique: async (query) => query.where.provider_providerSubject ? null : null,
          create: async ({ data }) => { createdIdentity = data; return { id: 8 }; },
        },
        user: {
          findMany: async ({ where, take }) => {
            assert.deepEqual({ where, take }, { where: { email: user.email }, take: 2 });
            return [{ id: user.id }];
          },
          findUnique: async () => user,
        },
      };
      prisma.$transaction = async (callback) => callback(transaction);
      const result = await loginWithGoogle(
        { credential: "verified-token" },
        { verifyGoogleCredential: async () => ({
          providerSubject: "durable-google-sub", email: "RIYA@example.com",
        }) },
      );
      assert.deepEqual(createdIdentity, {
        userId: user.id,
        provider: "GOOGLE",
        providerSubject: "durable-google-sub",
      });
      assert.equal(result.user.role, user.role);
      assert.equal(result.organization.id, user.organizationId);
    });

    await context.test("unknown and cross-tenant ambiguous emails return the same safe state", async () => {
      for (const candidates of [[], [{ id: 1 }, { id: 2 }]]) {
        prisma.$transaction = async (callback) => callback({
          authIdentity: { findUnique: async () => null },
          user: { findMany: async () => candidates },
        });
        await assert.rejects(
          loginWithGoogle(
            { credential: "verified-token" },
            { verifyGoogleCredential: async () => ({
              providerSubject: "unlinked-sub", email: "shared@example.com",
            }) },
          ),
          (error) => error.statusCode === 403 &&
            error.code === "GOOGLE_ACCOUNT_NOT_LINKED" &&
            error.message === "No ResolveAI account is linked to this Google account",
        );
      }
    });

    await context.test("a user already linked to another Google sub is not silently merged", async () => {
      prisma.$transaction = async (callback) => callback({
        authIdentity: {
          findUnique: async (query) => query.where.provider_providerSubject ? null : { id: 99 },
        },
        user: { findMany: async () => [{ id: user.id }] },
      });
      await assert.rejects(
        loginWithGoogle(
          { credential: "verified-token" },
          { verifyGoogleCredential: async () => ({
            providerSubject: "different-google-sub", email: user.email,
          }) },
        ),
        (error) => error.statusCode === 403 && error.code === "GOOGLE_ACCOUNT_NOT_LINKED",
      );
    });

    await context.test("malicious authority fields and malformed credentials fail before database access", async () => {
      prisma.$transaction = () => assert.fail("invalid input must not query the database");
      for (const input of [
        {},
        { credential: "token", organizationId: 1 },
        { credential: "token", role: "OWNER" },
        { credential: "token", userId: 1 },
        { credential: "token", permissions: ["*"] },
      ]) {
        await assert.rejects(
          loginWithGoogle(input, { verifyGoogleCredential: () => assert.fail("must not verify") }),
          (error) => error.statusCode === 400,
        );
      }
    });

    await context.test("invalid, expired, wrong-audience, and provider failures collapse safely", async () => {
      for (const providerFailure of [
        new GoogleCredentialError("expired provider detail"),
        new GoogleCredentialError("wrong audience detail"),
        new Error("credential and provider secret details"),
      ]) {
        await assert.rejects(
          loginWithGoogle(
            { credential: "secret-google-token" },
            { verifyGoogleCredential: async () => { throw providerFailure; } },
          ),
          (error) => error.statusCode === 401 &&
            error.code === "GOOGLE_CREDENTIAL_INVALID" &&
            error.message === "Google authentication failed" &&
            !error.message.includes("detail"),
        );
      }
    });

    await context.test("Google endpoint returns no credential, provider detail, or sensitive log", async () => {
      const originalConsoleError = console.error;
      const logged = [];
      console.error = (...values) => logged.push(values);
      try {
        const response = responseRecorder();
        await loginGoogleUser({
          body: { credential: "top-secret-google-credential" },
          app: { locals: {
            googleAuthDependencies: {
              verifyGoogleCredential: async () => { throw new Error("raw provider secret"); },
            },
          } },
        }, response);
        assert.equal(response.statusCode, 401);
        assert.deepEqual(response.body, {
          success: false,
          message: "Google authentication failed",
          code: "GOOGLE_CREDENTIAL_INVALID",
        });
        assert.equal(JSON.stringify(response.body).includes("top-secret"), false);
        assert.equal(JSON.stringify(response.body).includes("raw provider"), false);
        assert.equal(logged.length, 0);
      } finally {
        console.error = originalConsoleError;
      }
    });

    await context.test("official verification boundary enforces configured audience and verified email", async () => {
      const calls = [];
      const valid = await verifyGoogleCredential("provider-token", {
        clientId: "expected-client.apps.googleusercontent.com",
        client: { verifyIdToken: async (input) => {
          calls.push(input);
          return { getPayload: () => ({ sub: "subject-1", email: user.email, email_verified: true }) };
        } },
      });
      assert.deepEqual(calls, [{
        idToken: "provider-token", audience: "expected-client.apps.googleusercontent.com",
      }]);
      assert.equal(valid.providerSubject, "subject-1");

      await assert.rejects(
        verifyGoogleCredential("token", { clientId: "", client: {} }),
        GoogleIdentityConfigurationError,
      );
      await assert.rejects(
        verifyGoogleCredential("token", {
          clientId: "wrong-audience",
          client: { verifyIdToken: async () => { throw new Error("audience mismatch"); } },
        }),
        (error) => error instanceof GoogleCredentialError && !error.message.includes("audience"),
      );
      await assert.rejects(
        verifyGoogleCredential("token", {
          clientId: "client-id",
          client: { verifyIdToken: async () => ({
            getPayload: () => ({ sub: "subject-1", email: user.email, email_verified: false }),
          }) },
        }),
        GoogleCredentialError,
      );
    });

    await context.test("database uniqueness failures prevent duplicate provider identities", async () => {
      prisma.$transaction = async (callback) => callback({
        authIdentity: {
          findUnique: async () => null,
          create: async () => { throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002", clientVersion: "6.12.0",
          }); },
        },
        user: { findMany: async () => [{ id: user.id }] },
      });
      await assert.rejects(
        loginWithGoogle(
          { credential: "verified-token" },
          { verifyGoogleCredential: async () => ({ providerSubject: "sub", email: user.email }) },
        ),
        (error) => error.statusCode === 409 && error.code === "GOOGLE_ACCOUNT_LINK_CONFLICT",
      );
    });

    await context.test("middleware refreshes current role and removed memberships remain protected", async () => {
      const token = signJwt({ userId: user.id, organizationId: organization.id, role: "OWNER" });
      prisma.user.findFirst = async () => ({
        id: user.id, organizationId: organization.id, role: "VIEWER",
      });
      const request = { get: () => `Bearer ${token}` };
      const response = responseRecorder();
      let nextCalled = false;
      await authMiddleware(request, response, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
      assert.equal(request.user.role, "VIEWER");
      authorizeRoles("OWNER")(request, response, () => assert.fail("VIEWER must not become OWNER"));
      assert.equal(response.statusCode, 403);

      prisma.user.findFirst = async () => null;
      const removedResponse = responseRecorder();
      await authMiddleware({ get: () => `Bearer ${token}` }, removedResponse, () => assert.fail("removed user"));
      assert.equal(removedResponse.statusCode, 401);
    });
  } finally {
    prisma.organization.findUnique = original.organizationFindUnique;
    prisma.user.findUnique = original.userFindUnique;
    prisma.user.findFirst = original.userFindFirst;
    prisma.user.findMany = original.userFindMany;
    prisma.authIdentity.findUnique = original.authIdentityFindUnique;
    prisma.authIdentity.create = original.authIdentityCreate;
    prisma.$transaction = original.transaction;
    env.jwtSecret = original.jwtSecret;
    env.jwtExpiresIn = original.jwtExpiresIn;
    env.bcryptRounds = original.bcryptRounds;
    await prisma.$disconnect();
  }
});
