import { randomUUID } from "node:crypto";
import { closePool, pool } from "../../../packages/database/src/index.ts";
import { hash, newAccessToken } from "./auth-core.ts";

async function main() {
  const [command, subject, arg, daysRaw] = process.argv.slice(2);
  if (command === "issue") {
    if (!subject || !arg)
      throw new Error(
        "usage: access-token-cli issue <username> <label> [days]",
      );
    const days = daysRaw === undefined ? 30 : Number(daysRaw);
    if (!Number.isInteger(days) || days < 1 || days > 366)
      throw new Error("days must be 1-366");
    const operator = (
      await pool().query(
        "SELECT id FROM operators WHERE username=$1 AND disabled_at IS NULL",
        [subject.trim().toLowerCase()],
      )
    ).rows[0];
    if (!operator) throw new Error("operator not found");
    const raw = newAccessToken();
    await pool().query(
      "INSERT INTO operator_access_tokens(id,operator_id,token_hash,label,expires_at) VALUES($1,$2,$3,$4,now()+($5::text||' days')::interval)",
      [randomUUID(), operator.id, hash(raw), arg, days],
    );
    process.stdout.write(`${raw}\n`);
    return;
  }
  if (command === "revoke") {
    if (!subject) throw new Error("usage: access-token-cli revoke <token-id>");
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      const changed = await client.query(
        "UPDATE operator_access_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 RETURNING id",
        [subject],
      );
      if (!changed.rowCount) throw new Error("token not found");
      await client.query("DELETE FROM auth_sessions WHERE access_token_id=$1", [
        subject,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }
  throw new Error("usage: access-token-cli <issue|revoke> ...");
}
main()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "access token command failed"}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => closePool());
