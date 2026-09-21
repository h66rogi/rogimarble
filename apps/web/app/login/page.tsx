'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type AuthConfig } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [config, setConfig] = useState<AuthConfig | null>(null);
  useEffect(() => { api.authConfig().then(setConfig).catch(error => setError(error instanceof Error ? error.message : '로그인 방식을 확인하지 못했습니다.')); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await api.login(String(data.get('username')), String(data.get('password'))); router.push('/'); } catch (e) { setError(e instanceof Error ? e.message : '로그인 실패'); } finally { setBusy(false); } }
  async function checkSharedSession() { setBusy(true); setError(''); try { await api.bootstrapSession(); router.push('/'); } catch (e) { setError(e instanceof Error ? e.message : '로그인 세션을 확인하지 못했습니다.'); } finally { setBusy(false); } }
  const sharedReady = config?.mode === 'shared' && config.sharedCookieEnabled === true;
  return <main className="auth-page"><section className="auth-intro"><span className="manage-brand-mark">R</span><p>ROGIMARBLE CONSOLE</p><h1>방송의 흐름을<br />한눈에 관리하세요.</h1><span>주사위와 말, 미션과 보상을 실시간으로 운영합니다.</span></section><form className="auth-card" onSubmit={submit}><div><span className="eyebrow">OPERATOR ACCESS</span><h2>운영자 로그인</h2>{sharedReady ? <p>rogi.chat 로그인 후 현재 세션을 확인하세요.</p> : config?.mode === 'shared' ? <p>rogi.chat 계정 연동은 준비 중입니다. 현재 운영자 로그인은 아직 사용할 수 없습니다.</p> : <p>발급받은 운영 계정으로 로그인하세요.</p>}</div>{sharedReady ? <><a className="shared-login-link" href={config.loginUrl ?? 'https://rogi.chat'}>rogi.chat에서 로그인</a><button type="button" disabled={busy} onClick={checkSharedSession}>{busy ? '확인 중…' : '로그인 세션 확인'}</button></> : config?.mode === 'local' ? <><label>아이디<input name="username" autoComplete="username" required autoFocus /></label><label>비밀번호<input type="password" name="password" autoComplete="current-password" required /></label><button className="primary-button" disabled={busy || !config}>{busy ? '로그인 확인 중…' : '운영 콘솔 로그인'}</button></> : <div className="auth-unavailable">공유 로그인 발급 방식이 준비되면 이 화면에서 안내합니다.</div>}{error && <div className="error-banner" role="alert">{error}</div>}<div className="auth-divider"><span>서비스 관리</span></div><a className="admin-login-link" href="/admin/login">관리자 로그인</a></form></main>;
}
