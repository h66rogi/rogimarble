import { randomBytes, randomUUID } from "node:crypto";
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type {
  AccessTokenDto,
  IssuedAccessTokenDto,
  LoginResponse,
} from "../../../packages/contracts/src/index.ts";
import { pool, transaction } from "../../../packages/database/src/index.ts";
import { hash, localCsrfToken, sessionCookieValue } from "./auth.ts";
import { newAccessToken, validAccessToken } from "./auth-core.ts";

const dto = (row: any): AccessTokenDto => ({
  id: row.id,
  label: row.label,
  expiresAt: new Date(row.expires_at).toISOString(),
  lastUsedAt: row.last_used_at
    ? new Date(row.last_used_at).toISOString()
    : null,
  revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  createdAt: new Date(row.created_at).toISOString(),
});
@Injectable()
export class AccessTokenService {
  async exchange(
    raw: unknown,
  ): Promise<{ body: LoginResponse; cookie: string; expires: Date }> {
    if (!validAccessToken(raw))
      throw new UnauthorizedException("Invalid access token");
    const result = await transaction(async (client) => {
      const found = await client.query<any>(
        `SELECT t.*,o.username,o.role,o.disabled_at FROM operator_access_tokens t JOIN operators o ON o.id=t.operator_id WHERE t.token_hash=$1 FOR UPDATE OF t`,
        [hash(raw)],
      );
      if (
        !found.rowCount ||
        found.rows[0].revoked_at ||
        found.rows[0].disabled_at ||
        new Date(found.rows[0].expires_at) <= new Date()
      )
        return null;
      const sessionRaw = randomBytes(32).toString("base64url"),
        csrf = localCsrfToken(sessionRaw),
        expires = new Date(
          Math.min(
            Date.now() + 8 * 60 * 60_000,
            new Date(found.rows[0].expires_at).getTime(),
          ),
        );
      await client.query(
        "UPDATE operator_access_tokens SET last_used_at=now() WHERE id=$1",
        [found.rows[0].id],
      );
      await client.query(
        "INSERT INTO auth_sessions(id_hash,operator_id,csrf_hash,expires_at,access_token_id) VALUES($1,$2,$3,$4,$5)",
        [
          hash(sessionRaw),
          found.rows[0].operator_id,
          hash(csrf),
          expires,
          found.rows[0].id,
        ],
      );
      return { sessionRaw, csrf, expires, row: found.rows[0] };
    });
    if (!result) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      throw new UnauthorizedException("Invalid access token");
    }
    return {
      cookie: sessionCookieValue(result.sessionRaw),
      expires: result.expires,
      body: {
        operator: {
          id: result.row.operator_id,
          username: result.row.username,
          role: result.row.role,
        },
        csrfToken: result.csrf,
        authMode: "token",
      },
    };
  }
  async list(operatorId: string): Promise<AccessTokenDto[]> {
    return (
      await pool().query(
        "SELECT * FROM operator_access_tokens WHERE operator_id=$1 ORDER BY created_at DESC",
        [operatorId],
      )
    ).rows.map(dto);
  }
  async issue(
    operatorId: string,
    label: unknown,
    expiresAt: unknown,
  ): Promise<IssuedAccessTokenDto> {
    if (typeof label !== "string" || !label.trim() || label.trim().length > 80)
      throw new UnprocessableEntityException(
        "토큰 이름은 1~80자로 입력하세요.",
      );
    const expires =
      expiresAt === undefined
        ? new Date(Date.now() + 30 * 86400_000)
        : new Date(String(expiresAt));
    if (
      !Number.isFinite(expires.getTime()) ||
      expires <= new Date() ||
      expires.getTime() > Date.now() + 366 * 86400_000
    )
      throw new UnprocessableEntityException(
        "만료 시각은 지금부터 1년 이내여야 합니다.",
      );
    const token = newAccessToken(),
      id = randomUUID();
    const row = (
      await pool().query(
        "INSERT INTO operator_access_tokens(id,operator_id,token_hash,label,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [id, operatorId, hash(token), label.trim(), expires],
      )
    ).rows[0];
    return { ...dto(row), token };
  }
  async revoke(operatorId: string, id: string): Promise<void> {
    const changed = await transaction(async (client) => {
      const row = await client.query(
        "UPDATE operator_access_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND operator_id=$2 RETURNING id",
        [id, operatorId],
      );
      if (!row.rowCount) return false;
      await client.query("DELETE FROM auth_sessions WHERE access_token_id=$1", [
        id,
      ]);
      return true;
    });
    if (!changed) throw new NotFoundException("토큰을 찾을 수 없습니다.");
  }
}
