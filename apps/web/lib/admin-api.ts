import {
  adminApi as routes,
  type AdminAuditDto,
  type AdminChannelDto,
  type AdminChannelMemberDto,
  type AdminLoginResponse,
  type AdminOperatorDto,
  type AdminRole,
  type ChannelPermission,
  type ExternalBindingDto,
} from "@rogimarble/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
const CSRF_KEY = "rogimarble.admin.csrf";

export class AdminApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type AdminIdentity = AdminLoginResponse["admin"];
export type AdminOperator = AdminOperatorDto;
export type AdminChannel = AdminChannelDto;
export type AdminChannelMember = AdminChannelMemberDto;
export type ExternalBinding = ExternalBindingDto;
export type AuditEntry = AdminAuditDto;
export type { AdminRole, ChannelPermission };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const csrf =
    typeof sessionStorage === "undefined"
      ? null
      : sessionStorage.getItem(CSRF_KEY);
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = "";
    try {
      const value = JSON.parse(text) as { message?: string | string[] };
      detail = Array.isArray(value.message)
        ? value.message.join(", ")
        : (value.message ?? "");
    } catch {
      detail = "";
    }
    const fallback: Record<number, string> = {
      400: "입력 내용을 다시 확인하세요.",
      401: "관리자 로그인이 만료되었습니다.",
      403: "이 작업을 수행할 권한이 없습니다.",
      404: "관리 대상을 찾지 못했습니다.",
      409: "현재 상태에서는 변경할 수 없습니다. 마지막 관리자 또는 소유자 권한을 확인하세요.",
    };
    const translated: Record<string, string> = {
      "Invalid admin credentials": "아이디 또는 비밀번호가 올바르지 않습니다.",
      "Current password incorrect": "현재 비밀번호가 올바르지 않습니다.",
      "Username exists": "이미 사용 중인 아이디입니다.",
      "Admin session required": "관리자 로그인이 필요합니다.",
    };
    throw new AdminApiError(
      translated[detail] || fallback[response.status] || "관리 요청을 처리하지 못했습니다.",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function saveSession(result: AdminLoginResponse) {
  sessionStorage.setItem(CSRF_KEY, result.csrfToken);
  return result;
}

export const adminApi = {
  login: async (username: string, password: string) =>
    saveSession(
      await request<AdminLoginResponse>(routes.login, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    ),
  session: async () =>
    saveSession(await request<AdminLoginResponse>(routes.session)),
  logout: async () => {
    await request<void>(routes.logout, { method: "POST", body: "{}" });
    sessionStorage.removeItem(CSRF_KEY);
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>(routes.changePassword, {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  operators: () => request<{ operators: AdminOperatorDto[] }>(routes.operators),
  createOperator: (body: {
    username: string;
    password: string;
    role: AdminRole;
  }) =>
    request<AdminOperatorDto>(routes.operators, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchOperator: (id: string, body: { role?: AdminRole; disabled?: boolean }) =>
    request<AdminOperatorDto>(routes.operator(id), {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  resetPassword: (id: string, password: string) =>
    request<void>(routes.resetPassword(id), {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  channels: () => request<{ channels: AdminChannelDto[] }>(routes.channels),
  createChannel: (body: {
    id: string;
    displayName: string;
    ownerOperatorId: string;
  }) =>
    request<AdminChannelDto>(routes.channels, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  renameChannel: (id: string, displayName: string) =>
    request<AdminChannelDto>(routes.channel(id), {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    }),
  putMember: (
    channelId: string,
    operatorId: string,
    permission: ChannelPermission,
  ) =>
    request<void>(routes.channelMember(channelId, operatorId), {
      method: "PUT",
      body: JSON.stringify({ permission }),
    }),
  removeMember: (channelId: string, operatorId: string) =>
    request<void>(routes.channelMember(channelId, operatorId), {
      method: "DELETE",
      body: "{}",
    }),
  bindings: () =>
    request<{ bindings: ExternalBindingDto[] }>(routes.externalBindings),
  createBinding: (subject: string, operatorId: string) =>
    request<ExternalBindingDto>(routes.externalBindings, {
      method: "POST",
      body: JSON.stringify({ issuer: "rogichat", subject, operatorId }),
    }),
  removeBinding: (subject: string) =>
    request<void>(routes.externalBinding("rogichat", subject), {
      method: "DELETE",
      body: "{}",
    }),
  audit: (cursor?: string) =>
    request<{ entries: AdminAuditDto[]; nextCursor: string | null }>(
      `${routes.audit}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
};
