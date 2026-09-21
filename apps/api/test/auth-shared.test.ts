import assert from "node:assert/strict";
import test from "node:test";
import {
  hash,
  localCsrfToken,
  newAccessToken,
  validAccessToken,
  validCsrf,
} from "../src/auth-core.ts";

const prior = { ...process.env };
test.before(() => {
  process.env.WEB_ORIGIN = "https://marble.rogi.chat";
  process.env.SESSION_SECRET =
    "test-only-session-secret-longer-than-thirty-two-bytes";
});
test.after(() => {
  for (const key of Object.keys(process.env))
    if (!(key in prior)) delete process.env[key];
  Object.assign(process.env, prior);
});

test("access tokens are high entropy, prefixed, and accepted only in the exact format", () => {
  const first = newAccessToken(),
    second = newAccessToken();
  assert.match(first, /^rma_[A-Za-z0-9_-]{43}$/);
  assert.equal(validAccessToken(first), true);
  assert.notEqual(first, second);
  assert.equal(validAccessToken(first + "x"), false);
  assert.equal(validAccessToken("rma_" + ".".repeat(43)), false);
});

test("database token hashes do not disclose the bearer credential", () => {
  const token = newAccessToken();
  assert.equal(hash(token).length, 64);
  assert.equal(hash(token).includes(token), false);
});

test("token sessions require both session-bound CSRF and exact browser origin", () => {
  const csrf = "csrf-token";
  assert.equal(
    validCsrf(
      hash(csrf),
      csrf,
      "token",
      "https://marble.rogi.chat",
      "https://marble.rogi.chat",
    ),
    true,
  );
  assert.equal(
    validCsrf(
      hash(csrf),
      csrf,
      "token",
      "https://evil.invalid",
      "https://marble.rogi.chat",
    ),
    false,
  );
  assert.equal(
    validCsrf(
      hash(csrf),
      "wrong",
      "token",
      "https://marble.rogi.chat",
      "https://marble.rogi.chat",
    ),
    false,
  );
});

test("session CSRF is stable per session and differs across sessions", () => {
  assert.equal(localCsrfToken("session-a"), localCsrfToken("session-a"));
  assert.notEqual(localCsrfToken("session-a"), localCsrfToken("session-b"));
});

test("file-based bootstrap leaves one database credential source and rejects ambiguous input", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { loadSecret } = await import("../src/runtime-secrets.ts");
  const { databaseUrl } = await import(
    "../../../packages/database/src/index.ts"
  );
  const directory = mkdtempSync(join(tmpdir(), "marble-secret-test-"));
  const previousUrl = process.env.DATABASE_URL,
    previousFile = process.env.DATABASE_URL_FILE;
  try {
    const file = join(directory, "database-url");
    writeFileSync(file, "postgresql://fixture:fixture@localhost/fixture\n", {
      mode: 0o600,
    });
    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL_FILE = file;
    loadSecret("DATABASE_URL");
    assert.equal(process.env.DATABASE_URL_FILE, undefined);
    assert.equal(
      databaseUrl(),
      "postgresql://fixture:fixture@localhost/fixture",
    );
    loadSecret("DATABASE_URL");
    assert.throws(
      () =>
        loadSecret("DATABASE_URL", {
          DATABASE_URL: "explicit",
          DATABASE_URL_FILE: file,
        }),
      /Set only one/,
    );
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousFile === undefined) delete process.env.DATABASE_URL_FILE;
    else process.env.DATABASE_URL_FILE = previousFile;
    rmSync(directory, { recursive: true, force: true });
  }
});
