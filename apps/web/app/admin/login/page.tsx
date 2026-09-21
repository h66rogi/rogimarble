"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "../../../lib/admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await adminApi.login(
        String(data.get("username")),
        String(data.get("password")),
      );
      router.replace("/admin");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "관리자 로그인을 확인하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <span className="manage-brand-mark">R</span>
        <p>ROGIMARBLE ADMIN</p>
        <h1>
          방송 운영의 기반을
          <br />
          안전하게 관리하세요.
        </h1>
        <span>계정과 채널 권한, 외부 계정 연결 기록을 관리합니다.</span>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div>
          <span className="eyebrow">ADMIN ACCESS</span>
          <h2>관리자 로그인</h2>
          <p>운영 콘솔 계정과 분리된 관리자 계정을 사용합니다.</p>
        </div>
        <label>
          아이디
          <input name="username" autoComplete="username" required autoFocus />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "로그인 확인 중…" : "관리자 로그인"}
        </button>
        <Link className="auth-back" href="/login">
          운영자 로그인으로 돌아가기
        </Link>
      </form>
    </main>
  );
}
