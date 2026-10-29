import React, { useState } from 'react';
import { Activity, Headphones, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { authRequest, googleLoginUrl } from '../services/authApi';
import type { AccountProfile } from '../services/authApi';

type Props = { theme: 'dark' | 'light'; onTheme: () => void; onAuthenticated: (profile: AccountProfile) => void; expired?: boolean; providerError?: string };
type Mode = 'login' | 'register' | 'otp' | 'verify' | 'recovery';
export const AuthPage: React.FC<Props> = ({ theme, onTheme, onAuthenticated, expired, providerError }) => {
  const [mode, setMode] = useState<Mode>('login'); const [fullName, setFullName] = useState(''); const [username, setUsername] = useState('');
  const [email, setEmail] = useState(''); const [identity, setIdentity] = useState(''); const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(''); const [code, setCode] = useState(''); const [visible, setVisible] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'register') {
        if (password !== confirm) throw new Error('Passwords do not match.');
        await authRequest('/register', 'POST', { fullName, username, email, password }); setMode('verify'); setNotice('Check your email for a six-digit verification code.');
      } else if (mode === 'verify') {
        const result = await authRequest<{ user: AccountProfile }>('/email/verify', 'POST', { email, code }); onAuthenticated(result.user);
      } else if (mode === 'otp') {
        if (!otpRequested) { await authRequest('/email/otp/request', 'POST', { email }); setOtpRequested(true); setNotice('If an eligible account exists, a sign-in code has been sent.'); }
        else { const result = await authRequest<{ user: AccountProfile }>('/email/otp/verify', 'POST', { email, code }); onAuthenticated(result.user); }
      } else if (mode === 'recovery') {
        if (!recoveryRequested) { const result = await authRequest<{ message: string }>('/password/recovery/request', 'POST', { email }); setRecoveryRequested(true); setNotice(result.message); }
        else { await authRequest('/password/recovery/complete', 'POST', { email, code, password }); setMode('login'); setPassword(''); setCode(''); setRecoveryRequested(false); setNotice('Password updated. Sign in with your new password.'); }
      } else {
        const result = await authRequest<{ user: AccountProfile }>('/login', 'POST', { identity, password }); onAuthenticated(result.user);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete this request.'); }
    finally { setBusy(false); }
  };
  const switchMode = (next: Mode) => { setMode(next); setError(''); setNotice(''); setCode(''); setPassword(''); setConfirm(''); setRecoveryRequested(false); setOtpRequested(false); };
  const title = mode === 'register' ? 'Create your account' : mode === 'verify' ? 'Verify your email' : mode === 'otp' ? 'Sign in with email' : mode === 'recovery' ? 'Reset your password' : 'Welcome back';
  return <main className="app-shell flex min-h-screen items-center justify-center px-5 py-10 text-[#352820]" data-theme={theme}>
    <section className="welcome-card relative w-full max-w-lg rounded-3xl border border-[#8c62451c] bg-[#fffaf2] p-7 shadow-xl sm:p-9" aria-labelledby="auth-title">
      <button type="button" className="workspace-header-button absolute right-6 top-6" onClick={onTheme} aria-label="Change theme">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#bd674b] text-white"><Headphones size={27} /></div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#a7533b]">ProxiSpeak · Virtual office</p>
      <h1 id="auth-title" className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#887665]">Use your account to join the shared workspace.</p>
      {expired && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Your session expired after inactivity. Sign in to rejoin.</p>}
      {providerError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{providerError}</p>}
      <form className="mt-7 space-y-4" onSubmit={submit}>
        {mode === 'register' && <><label className="block text-sm font-semibold">Full name<input className="auth-input" autoComplete="name" required maxLength={32} value={fullName} onChange={e => setFullName(e.target.value)} /></label><label className="block text-sm font-semibold">Username<input className="auth-input" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={e => setUsername(e.target.value)} /></label><label className="block text-sm font-semibold">Email address<input className="auth-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label></>}
        {mode === 'login' && <label className="block text-sm font-semibold">Username or email<input className="auth-input" autoComplete="username" required value={identity} onChange={e => setIdentity(e.target.value)} /></label>}
        {mode === 'otp' && <><label className="block text-sm font-semibold">Email address<input className="auth-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>{otpRequested && <label className="block text-sm font-semibold">Six-digit code<input className="auth-input" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>}</>}
        {mode === 'recovery' && <><label className="block text-sm font-semibold">Account email<input className="auth-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>{recoveryRequested && <><label className="block text-sm font-semibold">Six-digit recovery code<input className="auth-input" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label><label className="block text-sm font-semibold">New password<input className="auth-input" type="password" required minLength={10} maxLength={200} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label></>}</>}
        {mode === 'verify' && <><label className="block text-sm font-semibold">Email address<input className="auth-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="block text-sm font-semibold">Verification code<input className="auth-input" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label></>}
        {(mode === 'login' || mode === 'register') && <label className="block text-sm font-semibold">Password<div className="relative"><input className="auth-input pr-12" type={visible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#887665]" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>}
        {mode === 'register' && <label className="block text-sm font-semibold">Confirm password<input className="auth-input" type={visible ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#bd674b] px-4 py-3 font-semibold text-white hover:bg-[#a9573e] disabled:opacity-60">{busy && <Activity size={16} className="animate-pulse" />}{mode === 'otp' && !otpRequested ? 'Send sign-in code' : mode === 'otp' ? 'Sign in with code' : mode === 'recovery' && !recoveryRequested ? 'Send recovery code' : mode === 'recovery' ? 'Reset password' : mode === 'verify' ? 'Verify and join' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
      </form>
      {(mode === 'login' || mode === 'register') && <><div className="my-5 flex items-center gap-3 text-xs text-[#887665]"><span className="h-px flex-1 bg-[#ddcdbb]" />or<span className="h-px flex-1 bg-[#ddcdbb]" /></div><button type="button" onClick={() => { window.location.href = googleLoginUrl; }} className="auth-secondary">Continue with Google</button><button type="button" onClick={() => switchMode('otp')} className="auth-secondary mt-2">Continue with email code</button></>}
      {mode === 'verify' && <button type="button" className="mt-3 w-full text-sm font-semibold text-[#a7533b]" onClick={async () => { setError(''); setNotice(''); try { const result = await authRequest<{ message: string }>('/email/verify/request', 'POST', { email }); setNotice(result.message); } catch (e) { setError(e instanceof Error ? e.message : 'Could not resend the code.'); } }}>Resend verification code</button>}
      <div className="mt-5 text-center text-sm text-[#887665]">{mode === 'login' ? <>New here? <button className="font-semibold text-[#a7533b]" onClick={() => switchMode('register')}>Create an account</button><br/><button className="mt-3 text-xs underline" onClick={() => { setEmail(identity.includes('@') ? identity : ''); switchMode('recovery'); }}>Forgot password?</button></> : <button className="font-semibold text-[#a7533b]" onClick={() => switchMode('login')}>Back to sign in</button>}</div>
    </section>
  </main>;
};
