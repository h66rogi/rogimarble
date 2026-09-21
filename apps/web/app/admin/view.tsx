"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminApi,
  AdminApiError,
  type AdminChannel,
  type AdminIdentity,
  type AdminOperator,
  type AuditEntry,
  type ExternalBinding,
} from "../../lib/admin-api";

type Tab = "overview" | "operators" | "channels" | "bindings" | "audit";

export function AdminDashboard() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [bindings, setBindings] = useState<ExternalBinding[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const session = await adminApi.session();
      setAdmin(session.admin);
      const [operatorData, channelData, bindingData, auditData] =
        await Promise.all([
          adminApi.operators(),
          adminApi.channels(),
          adminApi.bindings(),
          adminApi.audit(),
        ]);
      setOperators(operatorData.operators);
      setChannels(channelData.channels);
      setBindings(bindingData.bindings);
      setAudit(auditData.entries);
      setAuditCursor(auditData.nextCursor);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401)
        router.replace("/admin/login");
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "관리 정보를 불러오지 못했습니다.",
        );
    }
  }, [router]);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await load();
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401)
        router.replace("/admin/login");
      setError(
        cause instanceof Error ? cause.message : "변경을 저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="manage-shell admin-shell">
      <aside className="manage-sidebar">
        <div className="manage-brand">
          <span className="manage-brand-mark">R</span>
          <div>
            <strong>주루마블</strong>
            <small>서비스 관리자</small>
          </div>
        </div>
        <nav className="manage-nav">
          {(
            [
              ["overview", "대시보드", "⌂"],
              ["operators", "계정 관리", "●"],
              ["channels", "채널 관리", "▣"],
              ["bindings", "외부 계정 연결", "↗"],
              ["audit", "감사 기록", "≡"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="manage-sidebar-note">
          <strong>{admin?.username ?? "확인 중"}</strong>
          <button
            onClick={() =>
              mutate(async () => {
                await adminApi.logout();
                router.replace("/admin/login");
              })
            }
          >
            로그아웃
          </button>
        </div>
      </aside>
      <div className="manage-frame">
        <header className="admin-topbar">
          <div>
            <span className="eyebrow">SERVICE ADMIN</span>
            <h1>
              {tab === "overview"
                ? "관리 대시보드"
                : {
                    operators: "계정 관리",
                    channels: "채널 관리",
                    bindings: "외부 계정 연결",
                    audit: "감사 기록",
                  }[tab]}
            </h1>
            <p className="page-description">
              서비스 접근과 변경 이력을 관리합니다.
            </p>
          </div>
          <div className="admin-actions">
            <Link href="/">콘솔 미리보기</Link>
            <button onClick={() => void load()} disabled={busy}>
              새로고침
            </button>
            <button
              className="danger"
              onClick={() =>
                void mutate(async () => {
                  await adminApi.logout();
                  router.replace("/admin/login");
                })
              }
              disabled={busy}
            >
              로그아웃
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {tab === "overview" && (
          <>
            <section className="admin-overview">
              <Stat
                label="운영 계정"
                value={operators.length}
                hint={`${operators.filter((item) => !item.disabledAt).length}개 활성`}
              />
              <Stat
                label="채널"
                value={channels.length}
                hint={`${channels.reduce((sum, item) => sum + item.members.length, 0)}명 권한`}
              />
              <Stat
                label="외부 연결"
                value={bindings.length}
                hint="rogi.chat 연결"
              />
              <Stat label="최근 변경" value={audit.length} hint="최대 100건" />
            </section>
            <PasswordChange busy={busy} mutate={mutate} />
          </>
        )}
        {tab === "operators" && (
          <Operators operators={operators} busy={busy} mutate={mutate} />
        )}
        {tab === "channels" && (
          <Channels
            channels={channels}
            operators={operators}
            busy={busy}
            mutate={mutate}
          />
        )}
        {tab === "bindings" && (
          <Bindings
            bindings={bindings}
            operators={operators}
            busy={busy}
            mutate={mutate}
          />
        )}
        {tab === "audit" && (
          <Audit
            entries={audit}
            nextCursor={auditCursor}
            busy={busy}
            loadMore={async () => {
              if (!auditCursor) return;
              setBusy(true);
              try {
                const next = await adminApi.audit(auditCursor);
                setAudit((current) => [...current, ...next.entries]);
                setAuditCursor(next.nextCursor);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "감사 기록을 더 불러오지 못했습니다.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>
    </main>
  );
}

function PasswordChange({
  busy,
  mutate,
}: {
  busy: boolean;
  mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <form
      className="admin-form panel account-security"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        void mutate(() =>
          adminApi.changePassword(
            String(data.get("currentPassword")),
            String(data.get("newPassword")),
          ),
        ).then(() => form.reset());
      }}
    >
      <h2>내 비밀번호 변경</h2>
      <p>초기 비밀번호로 로그인했다면 먼저 새 비밀번호로 변경하세요.</p>
      <label>
        현재 비밀번호
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        새 비밀번호
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </label>
      <button disabled={busy}>비밀번호 변경</button>
    </form>
  );
}
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <article className="admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}
function Operators({
  operators,
  busy,
  mutate,
}: {
  operators: AdminOperator[];
  busy: boolean;
  mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <section className="admin-stack">
      <div className="collector-banner">
        새 계정은 rogi.chat 공유 로그인이 연결되기 전까지 로컬 운영 계정으로
        사용합니다. 외부 로그인에는 검증된 binding이 필요합니다.
      </div>
      <form
        className="admin-form panel"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(() =>
            adminApi.createOperator({
              username: String(data.get("username")),
              password: String(data.get("password")),
              role: String(data.get("role")) as AdminOperator["role"],
            }),
          );
        }}
      >
        <h2>새 운영 계정</h2>
        <label>
          아이디
          <input name="username" required />
        </label>
        <label>
          초기 비밀번호
          <input name="password" type="password" minLength={12} required />
        </label>
        <label>
          역할
          <select name="role">
            <option value="viewer">조회</option>
            <option value="operator">운영</option>
            <option value="admin">관리</option>
          </select>
        </label>
        <button disabled={busy}>계정 만들기</button>
      </form>
      <div className="admin-list">
        {operators.map((item) => (
          <article className="admin-row" key={item.id}>
            <div>
              <strong>{item.username}</strong>
              <span>
                {item.id} · {item.disabledAt ? "비활성" : "활성"}
              </span>
            </div>
            <select
              aria-label={`${item.username} 역할`}
              value={item.role}
              disabled={busy}
              onChange={(event) =>
                void mutate(() =>
                  adminApi.patchOperator(item.id, {
                    role: event.target.value as AdminOperator["role"],
                  }),
                )
              }
            >
              <option value="viewer">조회</option>
              <option value="operator">운영</option>
              <option value="admin">관리</option>
            </select>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void mutate(() =>
                  adminApi.patchOperator(item.id, {
                    disabled: !item.disabledAt,
                  }),
                )
              }
            >
              {item.disabledAt ? "활성화" : "비활성화"}
            </button>
            <PasswordReset operator={item} busy={busy} mutate={mutate} />
          </article>
        ))}
      </div>
    </section>
  );
}
function PasswordReset({
  operator,
  busy,
  mutate,
}: {
  operator: AdminOperator;
  busy: boolean;
  mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return open ? (
    <form
      className="inline-reset"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        void mutate(() =>
          adminApi.resetPassword(operator.id, String(data.get("password"))),
        ).then(() => {
          form.reset();
          setOpen(false);
        });
      }}
    >
      <input
        name="password"
        type="password"
        minLength={12}
        placeholder="새 비밀번호"
        aria-label={`${operator.username} 새 비밀번호`}
        required
      />
      <button disabled={busy}>저장</button>
      <button type="button" onClick={() => setOpen(false)}>
        취소
      </button>
    </form>
  ) : (
    <button disabled={busy} onClick={() => setOpen(true)}>
      비밀번호 재설정
    </button>
  );
}
function Channels({
  channels,
  operators,
  busy,
  mutate,
}: {
  channels: AdminChannel[];
  operators: AdminOperator[];
  busy: boolean;
  mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <section className="admin-stack">
      <form
        className="admin-form panel"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(() =>
            adminApi.createChannel({
              id: String(data.get("id")),
              displayName: String(data.get("displayName")),
              ownerOperatorId: String(data.get("ownerOperatorId")),
            }),
          );
        }}
      >
        <h2>새 채널</h2>
        <label>
          채널 ID
          <input name="id" required />
        </label>
        <label>
          표시 이름
          <input name="displayName" required />
        </label>
        <label>
          소유자
          <select name="ownerOperatorId" required>
            {operators
              .filter((item) => !item.disabledAt)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.username}
                </option>
              ))}
          </select>
        </label>
        <button disabled={busy}>채널 만들기</button>
      </form>
      <div className="admin-list">
        {channels.map((channel) => (
          <article className="admin-channel" key={channel.id}>
            <div className="admin-row">
              <div>
                <strong>{channel.displayName}</strong>
                <span>
                  {channel.id} · 멤버 {channel.members.length}명
                </span>
              </div>
              <form
                className="inline-reset"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void mutate(() =>
                    adminApi.renameChannel(
                      channel.id,
                      String(data.get("displayName")),
                    ),
                  );
                }}
              >
                <input
                  name="displayName"
                  defaultValue={channel.displayName}
                  aria-label={`${channel.displayName} 표시 이름`}
                  required
                />
                <button disabled={busy}>이름 저장</button>
              </form>
            </div>
            <div className="member-list">
              {channel.members.map((member) => (
                <div key={member.operatorId}>
                  <span>{member.username}</span>
                  <select
                    value={member.permission}
                    disabled={
                      busy || member.operatorId === channel.ownerOperatorId
                    }
                    onChange={(event) =>
                      void mutate(() =>
                        adminApi.putMember(
                          channel.id,
                          member.operatorId,
                          event.target.value as "view" | "operate" | "manage",
                        ),
                      )
                    }
                  >
                    <option value="view">조회</option>
                    <option value="operate">운영</option>
                    <option value="manage">관리</option>
                  </select>
                  <button
                    disabled={
                      busy || member.operatorId === channel.ownerOperatorId
                    }
                    title={
                      member.operatorId === channel.ownerOperatorId
                        ? "채널 소유자는 제거할 수 없습니다."
                        : undefined
                    }
                    onClick={() =>
                      void mutate(() =>
                        adminApi.removeMember(channel.id, member.operatorId),
                      )
                    }
                  >
                    제거
                  </button>
                </div>
              ))}
              <form
                className="member-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void mutate(() =>
                    adminApi.putMember(
                      channel.id,
                      String(data.get("operatorId")),
                      String(data.get("permission")) as
                        | "view"
                        | "operate"
                        | "manage",
                    ),
                  );
                }}
              >
                <select name="operatorId" required>
                  <option value="">계정 선택</option>
                  {operators
                    .filter(
                      (item) =>
                        !item.disabledAt &&
                        !channel.members.some(
                          (member) => member.operatorId === item.id,
                        ),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.username}
                      </option>
                    ))}
                </select>
                <select name="permission">
                  <option value="view">조회</option>
                  <option value="operate">운영</option>
                  <option value="manage">관리</option>
                </select>
                <button disabled={busy}>멤버 추가</button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
function Bindings({
  bindings,
  operators,
  busy,
  mutate,
}: {
  bindings: ExternalBinding[];
  operators: AdminOperator[];
  busy: boolean;
  mutate: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <section className="admin-stack">
      <div className="collector-banner">
        외부 계정 연결은 rogi.chat에서 검증된 subject만 등록합니다. 공유 로그인
        발급 연동은 별도 검증 중입니다.
      </div>
      <form
        className="admin-form panel"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(() =>
            adminApi.createBinding(
              String(data.get("subject")),
              String(data.get("operatorId")),
            ),
          );
        }}
      >
        <h2>외부 계정 연결</h2>
        <label>
          검증된 subject
          <input name="subject" required />
        </label>
        <label>
          운영 계정
          <select name="operatorId" required>
            {operators.map((item) => (
              <option key={item.id} value={item.id}>
                {item.username}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy}>연결 등록</button>
      </form>
      <div className="admin-list">
        {bindings.map((item) => (
          <article className="admin-row" key={`${item.issuer}:${item.subject}`}>
            <div>
              <strong>{item.username}</strong>
              <span>
                {item.issuer} · {item.subject}
              </span>
            </div>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void mutate(() => adminApi.removeBinding(item.subject))
              }
            >
              연결 해제
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
function Audit({
  entries,
  nextCursor,
  busy,
  loadMore,
}: {
  entries: AuditEntry[];
  nextCursor: string | null;
  busy: boolean;
  loadMore: () => Promise<void>;
}) {
  return (
    <section className="panel table-panel">
      <table>
        <thead>
          <tr>
            <th>시각</th>
            <th>작업</th>
            <th>대상</th>
            <th>관리자</th>
          </tr>
        </thead>
        <tbody>
          {entries.length ? (
            entries.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.createdAt).toLocaleString("ko-KR")}</td>
                <td>{item.action}</td>
                <td>
                  {item.targetType} · {item.targetId}
                </td>
                <td>{item.adminOperatorId}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>기록된 관리자 변경이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
      {nextCursor && (
        <button disabled={busy} onClick={loadMore}>
          이전 기록 더 보기
        </button>
      )}
    </section>
  );
}
