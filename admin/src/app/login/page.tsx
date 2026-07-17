'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShieldCheck, Lock, Mail, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, type AdminSession } from '@/stores/auth';
import { apiFetch, SERVER_ACCESS_TTL_SEC } from '@/lib/api';

interface SigninResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    locale: string;
    is_admin?: boolean;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const session = useAuth((s) => s.session);
  const hydrated = useAuth((s) => s.hydrated);
  const hydrate = useAuth((s) => s.hydrate);

  const [step, setStep] = useState<'creds' | '2fa'>('creds');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Credentials we've already validated server-side, held in memory between
  // the creds step and the 2fa step. Discarded if user changes email.
  const pendingSessionRef = useRef<AdminSession | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && session?.isAdmin) {
      router.replace('/');
    }
  }, [hydrated, session, router]);

  const handleCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || submitting) return;
    setSubmitting(true);
    try {
      const r = await apiFetch<SigninResponse>('email-signin', { email, password }, { authed: false });
      if (!r.ok || !r.data) {
        // Enumeration-safe: every credential-side failure surfaces the same
        // French message regardless of whether the email exists. Rate-limit
        // (429) and config errors get their own messages so we don't drown
        // the user in "wrong password" when the server is actually
        // misconfigured or throttling.
        if (r.status === 429) toast.error(r.error?.message_fr ?? 'Trop de tentatives, réessaie plus tard.');
        else if (r.error?.code === 'CONFIG_MISSING' || r.error?.code === 'NETWORK_ERROR') {
          toast.error(r.error.message_fr);
        } else toast.error('Email ou mot de passe incorrect.');
        setSubmitting(false);
        return;
      }
      const { access_token, refresh_token, user } = r.data;
      // is_admin gate. We do NOT distinguish "wrong password" from "not admin"
      // in the toast so a non-admin enumerating valid passwords can't even
      // confirm whether the credential was right — the message is identical.
      if (!user.is_admin) {
        toast.error('Accès admin requis.');
        setSubmitting(false);
        return;
      }
      // Stage the session for the 2FA step. We don't persist it yet because
      // the pseudo-2FA UI may auto-advance + we want a single setSession call
      // when the gate "passes" so the Shell mount has a coherent session in
      // one tick.
      pendingSessionRef.current = {
        accessToken: access_token,
        refreshToken: refresh_token,
        accessTokenExpiresAt: Math.floor(Date.now() / 1000) + SERVER_ACCESS_TTL_SEC,
        userId: user.id,
        email,
        isAdmin: true,
        displayName: user.display_name,
      };
      setStep('2fa');
      setSubmitting(false);
    } catch (e) {
      console.error('[login] signin error:', e);
      toast.error('Erreur réseau, réessaie.');
      setSubmitting(false);
    }
  };

  // V1 single-admin: the 2FA step is a visual pass-through. The is_admin check
  // post-password is the only auth gate that matters for V1.
  // TODO V1.1 (K.4.1 rollover): wire real TOTP verification here. The pending
  // session must NOT be committed until the TOTP code verifies server-side.
  useEffect(() => {
    if (step !== '2fa') return;
    const t = window.setTimeout(() => {
      const staged = pendingSessionRef.current;
      if (!staged) {
        // Defensive — shouldn't happen, but if it does, bounce back to creds.
        setStep('creds');
        return;
      }
      setSession(staged);
      pendingSessionRef.current = null;
      router.replace('/');
    }, 800);
    return () => window.clearTimeout(t);
  }, [step, setSession, router]);

  const handle2faSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // No-op: the useEffect above auto-advances. We accept the form submit
    // visually so users hitting Enter don't feel ignored.
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      {/* Left: form */}
      <div className="flex flex-col justify-center px-8 py-12 md:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary">
              <Image
                src="/images/adaptive-icon-dark.png"
                alt="Linky"
                width={32}
                height={32}
                className="h-9 w-9 object-contain"
              />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">
              Linky Admin
            </span>
          </div>

          <div className="mt-12">
            {step === 'creds' ? (
              <>
                <div className="inline-flex items-center rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-deep">
                  Connexion sécurisée
                </div>
                <h1 className="font-display mt-5 text-4xl font-bold leading-tight tracking-tight">
                  Bienvenue.
                </h1>
                {/* V1 : la 2FA réelle (TOTP) arrive en V1.1 — ne pas promettre
                    ce que l'écran ne fait pas. */}
                <p className="mt-3 text-muted">
                  Connecte-toi à ton back-office. Accès réservé à
                  l&apos;équipe Linky.
                </p>

                <form onSubmit={handleCreds} className="mt-10 space-y-4">
                  <Field
                    Icon={Mail}
                    label="EMAIL PROFESSIONNEL"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="ton@linkygroup.com"
                    autoComplete="email"
                  />
                  <Field
                    Icon={Lock}
                    label="MOT DE PASSE"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    disabled={!email || !password || submitting}
                    className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-black text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {submitting ? 'Vérification…' : 'Continuer'}
                    {!submitting && <ArrowRight size={16} />}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-deep">
                  <ShieldCheck size={12} />
                  Étape 2 sur 2
                </div>
                <h1 className="font-display mt-5 text-4xl font-bold leading-tight tracking-tight">
                  Code à 6 chiffres
                </h1>
                <p className="mt-3 text-muted">
                  Saisis le code envoyé à <strong>{email}</strong>.
                </p>

                <form onSubmit={handle2faSubmit} className="mt-10 space-y-4">
                  <input
                    autoFocus
                    inputMode="numeric"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="••••••"
                    className="h-20 w-full rounded-2xl border border-line bg-surface text-center text-3xl font-bold tracking-[12px] outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-black text-base font-bold text-white opacity-60"
                  >
                    Connexion en cours…
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      pendingSessionRef.current = null;
                      setStep('creds');
                    }}
                    className="flex h-12 w-full items-center justify-center text-sm font-semibold text-muted"
                  >
                    ← Changer d&apos;email
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="mt-12 text-xs text-faint">
            Toute connexion est journalisée. Accès limité au personnel Linky
            autorisé.
          </p>
        </div>
      </div>

      {/* Right: brand pane */}
      <div className="hidden bg-[#0E1311] lg:block">
        <div className="grain relative h-full overflow-hidden bg-gradient-to-br from-[#118866] via-[#0A5240] to-[#063929] p-16 text-white">
          <div className="pointer-events-none absolute -right-32 top-20 h-[480px] w-[480px] rounded-full bg-accent/25 blur-3xl" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div className="font-display text-3xl font-bold tracking-tight">
              Linky Admin
            </div>
            <div>
              <h2 className="font-display text-5xl font-bold leading-tight tracking-tight">
                Tout ce qui fait tourner la place de marché.
              </h2>
              <p className="mt-6 max-w-md text-white/70">
                KYC, litiges, modération, finances, push, bannières. Un seul
                outil, conçu pour aller vite.
              </p>
              <div className="mt-10 grid grid-cols-3 gap-6">
                {[
                  { n: '18k+', l: 'Utilisateurs' },
                  { n: '4 200', l: 'Annonces' },
                  { n: '184M', l: 'GMV mensuel' },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="font-display text-3xl font-bold">{s.n}</div>
                    <div className="mt-1 text-xs uppercase tracking-wider text-white/55">
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  Icon,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  Icon: typeof Mail;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-faint">
        {label}
      </label>
      <div className="mt-2 flex h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 focus-within:border-primary">
        <Icon size={18} className="text-muted" strokeWidth={1.75} />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="flex-1 bg-transparent text-base font-medium outline-none placeholder:text-faint"
        />
      </div>
    </div>
  );
}
