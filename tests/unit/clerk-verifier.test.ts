import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { clerkVerifier } from "../../apps/api/src/auth.js";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const verify = clerkVerifier("sk_test_unused", createLocalJWKSet({ keys: [jwk] }));
  const sign = (claims: Record<string, unknown>, opts: { exp?: string; key?: typeof privateKey } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key ?? privateKey);
  return { verify, sign };
}

describe("Clerk session verification", () => {
  it("accepts a valid token and returns the user id", async () => {
    const { verify, sign } = await setup();
    assert.deepEqual(await verify(await sign({ sub: "user_123" })), { userId: "user_123" });
  });

  it("rejects an expired token", async () => {
    const { verify, sign } = await setup();
    await assert.rejects(verify(await sign({ sub: "user_123" }, { exp: "-1m" })));
  });

  it("rejects a token signed with a different key", async () => {
    const { verify, sign } = await setup();
    const other = await generateKeyPair("RS256");
    await assert.rejects(verify(await sign({ sub: "user_123" }, { key: other.privateKey })));
  });

  it("rejects a token with no subject and garbage input", async () => {
    const { verify, sign } = await setup();
    await assert.rejects(verify(await sign({})));
    await assert.rejects(verify("not-a-jwt"));
  });

  it("enforces authorised origins only when the token names one", async () => {
    process.env.CLERK_AUTHORIZED_PARTIES = "https://app.example.com/";
    try {
      const { verify, sign } = await setup();
      assert.ok(await verify(await sign({ sub: "u", azp: "https://app.example.com" })));
      await assert.rejects(verify(await sign({ sub: "u", azp: "https://evil.example.com" })));
      assert.ok(await verify(await sign({ sub: "u" })));
    } finally {
      delete process.env.CLERK_AUTHORIZED_PARTIES;
    }
  });
});
