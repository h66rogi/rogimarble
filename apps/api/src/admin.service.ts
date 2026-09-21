import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  AdminAuditDto,
  AdminChannelDto,
  AdminOperatorDto,
  AdminRole,
  ChannelPermission,
  ExternalBindingDto,
} from "../../../packages/contracts/src/index.ts";
import { pool, transaction } from "../../../packages/database/src/index.ts";
import {
  hashPassword,
  verifyPassword,
} from "../../../packages/database/src/password.ts";

type Admin = { id: string };
async function audit(
  client: PoolClient,
  admin: Admin,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown,
) {
  await client.query(
    `INSERT INTO admin_audit_log(id,admin_operator_id,action,target_type,target_id,before_state,after_state) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), admin.id, action, targetType, targetId, before, after],
  );
}
async function assertAdmin(client: PoolClient, admin: Admin) {
  await client.query("SELECT pg_advisory_xact_lock($1)", [734925102]);
  const actor = await client.query(
    `SELECT id FROM operators WHERE id=$1 AND role='admin' AND disabled_at IS NULL FOR SHARE`,
    [admin.id],
  );
  if (!actor.rowCount)
    throw new ConflictException("Administrator access was revoked");
}
const operatorDto = (row: any): AdminOperatorDto => ({
  id: row.id,
  username: row.username,
  role: row.role,
  disabledAt: row.disabled_at ? new Date(row.disabled_at).toISOString() : null,
  createdAt: new Date(row.created_at).toISOString(),
});
function conflict(error: unknown, message: string): never {
  if ((error as any)?.code === "23505" || (error as any)?.code === "23503")
    throw new ConflictException(message);
  throw error;
}

@Injectable()
export class AdminService {
  async changeOwnPassword(
    admin: Admin,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const nextHash = await hashPassword(newPassword);
    await transaction(async (client) => {
      await assertAdmin(client, admin);
      const found = await client.query(
        "SELECT username,password_hash FROM operators WHERE id=$1 AND role='admin' AND disabled_at IS NULL FOR UPDATE",
        [admin.id],
      );
      if (
        !found.rowCount ||
        !(await verifyPassword(currentPassword, found.rows[0].password_hash))
      )
        throw new BadRequestException("Current password is incorrect");
      await client.query("UPDATE operators SET password_hash=$2 WHERE id=$1", [
        admin.id,
        nextHash,
      ]);
      await client.query("DELETE FROM auth_sessions WHERE operator_id=$1", [
        admin.id,
      ]);
      await audit(
        client,
        admin,
        "operator.change_own_password",
        "operator",
        admin.id,
        { username: found.rows[0].username },
        { passwordChanged: true },
      );
      await client.query("DELETE FROM admin_sessions WHERE operator_id=$1", [
        admin.id,
      ]);
    });
  }
  async operators(): Promise<{ operators: AdminOperatorDto[] }> {
    const result = await pool().query(
      "SELECT id,username,role,disabled_at,created_at FROM operators ORDER BY username",
    );
    return { operators: result.rows.map(operatorDto) };
  }
  async createOperator(
    admin: Admin,
    input: { username: string; password: string; role: AdminRole },
  ): Promise<AdminOperatorDto> {
    const id = randomUUID(),
      passwordHash = await hashPassword(input.password);
    try {
      return await transaction(async (client) => {
        await assertAdmin(client, admin);
        const inserted = await client.query(
          "INSERT INTO operators(id,username,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,username,role,disabled_at,created_at",
          [id, input.username, passwordHash, input.role],
        );
        const dto = operatorDto(inserted.rows[0]);
        await audit(
          client,
          admin,
          "operator.create",
          "operator",
          id,
          null,
          dto,
        );
        return dto;
      });
    } catch (error) {
      return conflict(error, "Username already exists");
    }
  }
  async updateOperator(
    admin: Admin,
    id: string,
    input: { role?: AdminRole; disabled?: boolean },
  ): Promise<AdminOperatorDto> {
    return transaction(async (client) => {
      await assertAdmin(client, admin);
      await client.query(
        `SELECT id FROM operators WHERE role='admin' FOR UPDATE`,
      );
      const found = await client.query(
        "SELECT id,username,role,disabled_at,created_at FROM operators WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!found.rowCount) throw new NotFoundException("Operator not found");
      const before = operatorDto(found.rows[0]);
      const nextRole = input.role ?? before.role,
        nextDisabled = input.disabled ?? !!before.disabledAt;
      if (id === admin.id && (nextRole !== "admin" || nextDisabled))
        throw new ConflictException(
          "Cannot demote or disable the current administrator",
        );
      if (
        before.role === "admin" &&
        !before.disabledAt &&
        (nextRole !== "admin" || nextDisabled)
      ) {
        const remaining = await client.query(
          `SELECT count(*)::int count FROM operators WHERE role='admin' AND disabled_at IS NULL AND id<>$1`,
          [id],
        );
        if (remaining.rows[0].count < 1)
          throw new ConflictException(
            "Cannot remove the last enabled administrator",
          );
      }
      const updated = await client.query(
        `UPDATE operators SET role=$2,disabled_at=CASE WHEN $3::boolean THEN COALESCE(disabled_at,now()) ELSE NULL END WHERE id=$1 RETURNING id,username,role,disabled_at,created_at`,
        [id, nextRole, nextDisabled],
      );
      if (nextDisabled || nextRole !== "admin")
        await client.query("DELETE FROM admin_sessions WHERE operator_id=$1", [
          id,
        ]);
      if (nextDisabled)
        await client.query("DELETE FROM auth_sessions WHERE operator_id=$1", [
          id,
        ]);
      const after = operatorDto(updated.rows[0]);
      await audit(
        client,
        admin,
        "operator.update",
        "operator",
        id,
        before,
        after,
      );
      return after;
    });
  }
  async resetPassword(
    admin: Admin,
    id: string,
    password: string,
  ): Promise<void> {
    if (id === admin.id)
      throw new ConflictException(
        "Use current-password verification to change your own password",
      );
    const passwordHash = await hashPassword(password);
    await transaction(async (client) => {
      await assertAdmin(client, admin);
      const found = await client.query(
        "SELECT id,username FROM operators WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!found.rowCount) throw new NotFoundException("Operator not found");
      await client.query("UPDATE operators SET password_hash=$2 WHERE id=$1", [
        id,
        passwordHash,
      ]);
      await client.query("DELETE FROM auth_sessions WHERE operator_id=$1", [
        id,
      ]);
      await client.query("DELETE FROM admin_sessions WHERE operator_id=$1", [
        id,
      ]);
      await audit(
        client,
        admin,
        "operator.reset_password",
        "operator",
        id,
        { username: found.rows[0].username },
        { sessionsRevoked: true },
      );
    });
  }
  async channels(): Promise<{ channels: AdminChannelDto[] }> {
    const channels = await pool().query(
      "SELECT id,display_name,owner_operator_id,created_at FROM channels ORDER BY id",
    );
    const members = await pool().query(
      `SELECT co.channel_id,co.operator_id,o.username,co.permission FROM channel_operators co JOIN operators o ON o.id=co.operator_id ORDER BY o.username`,
    );
    return {
      channels: channels.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        ownerOperatorId: row.owner_operator_id,
        createdAt: new Date(row.created_at).toISOString(),
        members: members.rows
          .filter((member) => member.channel_id === row.id)
          .map((member) => ({
            operatorId: member.operator_id,
            username: member.username,
            permission: member.permission,
          })),
      })),
    };
  }
  async createChannel(
    admin: Admin,
    input: { id: string; displayName: string; ownerOperatorId: string },
  ): Promise<AdminChannelDto> {
    try {
      return await transaction(async (client) => {
        await assertAdmin(client, admin);
        const owner = await client.query(
          "SELECT id,username,disabled_at FROM operators WHERE id=$1 FOR SHARE",
          [input.ownerOperatorId],
        );
        if (!owner.rowCount || owner.rows[0].disabled_at)
          throw new ConflictException("Owner must be an enabled operator");
        const inserted = await client.query(
          "INSERT INTO channels(id,display_name,owner_operator_id) VALUES($1,$2,$3) RETURNING *",
          [input.id, input.displayName, input.ownerOperatorId],
        );
        await client.query(
          `INSERT INTO channel_operators(channel_id,operator_id,permission) VALUES($1,$2,'manage')`,
          [input.id, input.ownerOperatorId],
        );
        const dto: AdminChannelDto = {
          id: input.id,
          displayName: input.displayName,
          ownerOperatorId: input.ownerOperatorId,
          createdAt: new Date(inserted.rows[0].created_at).toISOString(),
          members: [
            {
              operatorId: input.ownerOperatorId,
              username: owner.rows[0].username,
              permission: "manage",
            },
          ],
        };
        await audit(
          client,
          admin,
          "channel.create",
          "channel",
          input.id,
          null,
          dto,
        );
        return dto;
      });
    } catch (error) {
      return conflict(error, "Channel id already exists");
    }
  }
  async renameChannel(
    admin: Admin,
    id: string,
    displayName: string,
  ): Promise<void> {
    await transaction(async (client) => {
      await assertAdmin(client, admin);
      const found = await client.query(
        "SELECT display_name FROM channels WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!found.rowCount) throw new NotFoundException("Channel not found");
      await client.query("UPDATE channels SET display_name=$2 WHERE id=$1", [
        id,
        displayName,
      ]);
      await audit(
        client,
        admin,
        "channel.rename",
        "channel",
        id,
        { displayName: found.rows[0].display_name },
        { displayName },
      );
    });
  }
  async putMember(
    admin: Admin,
    channelId: string,
    operatorId: string,
    permission: ChannelPermission,
  ): Promise<void> {
    await transaction(async (client) => {
      await assertAdmin(client, admin);
      const channel = await client.query(
        "SELECT owner_operator_id FROM channels WHERE id=$1 FOR UPDATE",
        [channelId],
      );
      if (!channel.rowCount) throw new NotFoundException("Channel not found");
      const operator = await client.query(
        "SELECT id,disabled_at FROM operators WHERE id=$1 FOR SHARE",
        [operatorId],
      );
      if (!operator.rowCount || operator.rows[0].disabled_at)
        throw new ConflictException("Member must be an enabled operator");
      if (
        channel.rows[0].owner_operator_id === operatorId &&
        permission !== "manage"
      )
        throw new ConflictException(
          "Channel owner must retain manage permission",
        );
      const prior = await client.query(
        "SELECT permission FROM channel_operators WHERE channel_id=$1 AND operator_id=$2",
        [channelId, operatorId],
      );
      await client.query(
        `INSERT INTO channel_operators(channel_id,operator_id,permission) VALUES($1,$2,$3) ON CONFLICT(channel_id,operator_id) DO UPDATE SET permission=excluded.permission`,
        [channelId, operatorId, permission],
      );
      await audit(
        client,
        admin,
        "channel.member.set",
        "channel_member",
        `${channelId}:${operatorId}`,
        prior.rows[0] ?? null,
        { permission },
      );
    });
  }
  async deleteMember(
    admin: Admin,
    channelId: string,
    operatorId: string,
  ): Promise<void> {
    await transaction(async (client) => {
      await assertAdmin(client, admin);
      const channel = await client.query(
        "SELECT owner_operator_id FROM channels WHERE id=$1 FOR UPDATE",
        [channelId],
      );
      if (!channel.rowCount) throw new NotFoundException("Channel not found");
      if (channel.rows[0].owner_operator_id === operatorId)
        throw new ConflictException("Cannot remove the channel owner");
      const prior = await client.query(
        "SELECT permission FROM channel_operators WHERE channel_id=$1 AND operator_id=$2",
        [channelId, operatorId],
      );
      if (!prior.rowCount)
        throw new NotFoundException("Channel member not found");
      await client.query(
        "DELETE FROM channel_operators WHERE channel_id=$1 AND operator_id=$2",
        [channelId, operatorId],
      );
      await audit(
        client,
        admin,
        "channel.member.delete",
        "channel_member",
        `${channelId}:${operatorId}`,
        prior.rows[0],
        null,
      );
    });
  }
  async bindings(): Promise<{ bindings: ExternalBindingDto[] }> {
    const result = await pool().query(
      `SELECT b.issuer,b.subject,b.operator_id,o.username,b.created_at FROM external_auth_bindings b JOIN operators o ON o.id=b.operator_id ORDER BY b.created_at DESC`,
    );
    return {
      bindings: result.rows.map((row) => ({
        issuer: row.issuer,
        subject: row.subject,
        operatorId: row.operator_id,
        username: row.username,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  }
  async createBinding(
    admin: Admin,
    input: { issuer: "rogichat"; subject: string; operatorId: string },
  ): Promise<ExternalBindingDto> {
    try {
      return await transaction(async (client) => {
        await assertAdmin(client, admin);
        const operator = await client.query(
          "SELECT username,disabled_at FROM operators WHERE id=$1 FOR SHARE",
          [input.operatorId],
        );
        if (!operator.rowCount || operator.rows[0].disabled_at)
          throw new ConflictException(
            "Binding target must be an enabled operator",
          );
        const inserted = await client.query(
          "INSERT INTO external_auth_bindings(issuer,subject,operator_id) VALUES($1,$2,$3) RETURNING created_at",
          [input.issuer, input.subject, input.operatorId],
        );
        const dto = {
          ...input,
          username: operator.rows[0].username,
          createdAt: new Date(inserted.rows[0].created_at).toISOString(),
        };
        await audit(
          client,
          admin,
          "external_binding.create",
          "external_binding",
          `${input.issuer}:${input.subject}`,
          null,
          dto,
        );
        return dto;
      });
    } catch (error) {
      return conflict(error, "External subject or operator is already bound");
    }
  }
  async deleteBinding(
    admin: Admin,
    issuer: string,
    subject: string,
  ): Promise<void> {
    await transaction(async (client) => {
      await assertAdmin(client, admin);
      const prior = await client.query(
        "SELECT issuer,subject,operator_id FROM external_auth_bindings WHERE issuer=$1 AND subject=$2 FOR UPDATE",
        [issuer, subject],
      );
      if (!prior.rowCount)
        throw new NotFoundException("External binding not found");
      await client.query(
        "DELETE FROM external_auth_bindings WHERE issuer=$1 AND subject=$2",
        [issuer, subject],
      );
      await audit(
        client,
        admin,
        "external_binding.delete",
        "external_binding",
        `${issuer}:${subject}`,
        prior.rows[0],
        null,
      );
    });
  }
  async auditLog(
    limit: number,
    cursor: { createdAt: Date; id: string } | null,
  ): Promise<{ entries: AdminAuditDto[]; nextCursor: string | null }> {
    const result = await pool().query(
      `SELECT id,admin_operator_id,action,target_type,target_id,before_state,after_state,created_at
       FROM admin_audit_log WHERE ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid))
       ORDER BY created_at DESC,id DESC LIMIT $1`,
      [limit + 1, cursor?.createdAt ?? null, cursor?.id ?? null],
    );
    const hasMore = result.rows.length > limit;
    const page = result.rows.slice(0, limit);
    return {
      entries: page.map((row) => ({
        id: row.id,
        adminOperatorId: row.admin_operator_id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        before: row.before_state,
        after: row.after_state,
        createdAt: new Date(row.created_at).toISOString(),
      })),
      nextCursor: hasMore
        ? Buffer.from(
            `${new Date(page[page.length - 1].created_at).toISOString()}|${page[page.length - 1].id}`,
          ).toString("base64url")
        : null,
    };
  }
}
