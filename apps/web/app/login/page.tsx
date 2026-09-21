'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Radio } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { api, type AuthConfig } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  useEffect(() => { api.authConfig().then(setConfig).catch(() => setError('로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try { await api.login(String(data.get('username')), String(data.get('password'))); router.replace('/'); }
    catch { setError('아이디와 비밀번호를 확인해 주세요. 여러 번 실패했다면 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  async function checkSharedSession() {
    setBusy(true); setError('');
    try { await api.bootstrapSession(); router.replace('/'); }
    catch { setError('공유 로그인 또는 채널 권한을 확인하지 못했습니다. 발급받은 운영자 계정으로 로그인할 수 있습니다.'); }
    finally { setBusy(false); }
  }
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm font-medium"><Radio className="size-4" />주루마블 운영 콘솔</header>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <section className="w-full max-w-sm space-y-6">
          <div className="space-y-2"><h1 className="text-xl font-semibold">운영자 로그인</h1><p className="text-sm text-muted-foreground">발급받은 계정으로 방송과 게임을 관리하세요.</p></div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="username">아이디</Label><Input id="username" name="username" autoComplete="username" maxLength={80} required disabled={busy} /></div>
            <div className="space-y-2"><Label htmlFor="password">비밀번호</Label><Input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required disabled={busy} /></div>
            <Button className="w-full" disabled={busy || !config || config.localLoginEnabled === false}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}로그인</Button>
          </form>
          {config?.mode === 'shared' && <div className="space-y-3 border-t pt-5"><p className="text-xs text-muted-foreground">로기챗 계정이 연결되어 있다면 공유 세션을 확인할 수 있습니다.</p><div className="flex gap-2">{config.loginUrl && <Button variant="outline" asChild><a href={config.loginUrl}>로기챗 로그인</a></Button>}<Button variant="outline" disabled={busy} onClick={checkSharedSession}>공유 세션 확인</Button></div></div>}
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          <a href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" />콘솔로 돌아가기</a>
        </section>
      </div>
    </main>
  );
}
