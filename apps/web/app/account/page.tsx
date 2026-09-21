'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { api } from '../../lib/api';

export default function AccountPage() {
  const [account, setAccount] = useState<{username:string;mode?:'local'|'shared'} | null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{api.bootstrapSession().then(value=>setAccount({username:value.operator.username,mode:value.authMode})).catch(()=>setError('로그인이 필요합니다.'));},[]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setMessage('');setError('');
    const form=event.currentTarget,data=new FormData(form);
    if(data.get('newPassword')!==data.get('confirmPassword')){setError('새 비밀번호가 일치하지 않습니다.');return;}
    setBusy(true);
    try{await api.changePassword(String(data.get('currentPassword')),String(data.get('newPassword')));form.reset();setMessage('비밀번호를 변경했습니다. 다른 기기의 운영자 세션은 로그아웃됐습니다.');}
    catch(e){setError(e instanceof Error?e.message:'비밀번호를 변경하지 못했습니다.');}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen bg-background text-foreground">
    <header className="flex h-12 items-center gap-3 border-b px-4"><a href="/" className="inline-flex items-center gap-1 text-sm"><ArrowLeft className="size-4" />운영 콘솔</a><span className="text-sm text-muted-foreground">계정 관리</span></header>
    <section className="mx-auto max-w-md space-y-5 px-5 py-10"><div><h1 className="text-xl font-semibold">계정 관리</h1>{account&&<p className="mt-2 text-sm text-muted-foreground">{account.username}</p>}</div>
      {!account?<Button asChild variant="outline"><a href="/login">로그인</a></Button>:account.mode==='shared'?<p className="text-sm text-muted-foreground">로기챗 계정의 비밀번호는 로기챗에서 변경하세요.</p>:<form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="currentPassword">현재 비밀번호</Label><Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required disabled={busy}/></div>
        <div className="space-y-2"><Label htmlFor="newPassword">새 비밀번호</Label><Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy}/><p className="text-xs text-muted-foreground">12~128자로 입력하세요.</p></div>
        <div className="space-y-2"><Label htmlFor="confirmPassword">새 비밀번호 확인</Label><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy}/></div>
        <Button disabled={busy}>{busy&&<Loader2 className="mr-2 size-4 animate-spin"/>}비밀번호 변경</Button>
      </form>}
      {error&&<p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {message&&<p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
    </section>
  </main>;
}
