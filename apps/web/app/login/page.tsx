'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type AuthConfig } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [config, setConfig] = useState<AuthConfig | null>(null);
  useEffect(() => { api.authConfig().then(setConfig).catch(error => setError(error instanceof Error ? error.message : '로그인 방식을 확인하지 못했습니다.')); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await api.login(String(data.get('username')), String(data.get('password'))); router.push('/'); } catch (e) { setError(e instanceof Error ? e.message : '로그인 실패'); } finally { setBusy(false); } }
  async function checkSharedSession() { setBusy(true); setError(''); try { await api.bootstrapSession(); router.push('/'); } catch (e) { setError(e instanceof Error ? e.message : '로그인 세션을 확인하지 못했습니다.'); } finally { setBusy(false); } }
  return <main className="login-shell"><form className="login-card" onSubmit={submit}><span className="eyebrow">OPERATOR ACCESS</span><h1>운영자 로그인</h1>{config?.mode === 'shared' ? <><p>로기챗 로그인 후 이 페이지로 돌아와 세션을 다시 확인하세요.</p>{config.loginUrl && <a className="shared-login-link" href={config.loginUrl}>rogi.chat에서 로그인</a>}<button type="button" disabled={busy} onClick={checkSharedSession}>{busy ? '확인 중…' : '세션 다시 확인'}</button></> : <><p>배포 관리자가 발급한 계정으로 로그인하세요.</p><label>아이디<input name="username" autoComplete="username" required /></label><label>비밀번호<input type="password" name="password" autoComplete="current-password" required /></label><button disabled={busy || !config}>{busy ? '확인 중…' : '로그인'}</button></>}{error && <div className="error-banner">{error}</div>}</form></main>;
}
