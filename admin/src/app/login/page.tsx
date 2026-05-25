'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShieldCheck, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '@/stores/auth';

export default function LoginPage() {
  const router = useRouter();
  const signIn = useAuth((s) => s.signIn);
  const [step, setStep] = useState<'creds' | '2fa'>('creds');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const handleCreds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStep('2fa');
  };

  const handle2fa = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    signIn(email);
    router.replace('/');
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
                <p className="mt-3 text-text-muted">
                  Connecte-toi à ton back-office. Authentification 2FA
                  obligatoire.
                </p>

                <form onSubmit={handleCreds} className="mt-10 space-y-4">
                  <Field
                    Icon={Mail}
                    label="EMAIL PROFESSIONNEL"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="ton@linky.gn"
                  />
                  <Field
                    Icon={Lock}
                    label="MOT DE PASSE"
                    type="password"
                    value=""
                    onChange={() => {}}
                    placeholder="••••••••"
                  />
                  <button
                    type="submit"
                    disabled={!email}
                    className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-text text-base font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Continuer
                    <ArrowRight size={16} />
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
                <p className="mt-3 text-text-muted">
                  Saisis le code envoyé à <strong>{email}</strong>.
                </p>

                <form onSubmit={handle2fa} className="mt-10 space-y-4">
                  <input
                    autoFocus
                    inputMode="numeric"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="••••••"
                    className="h-20 w-full rounded-2xl border border-border bg-bg-elev text-center text-3xl font-bold tracking-[12px] outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={code.length !== 6}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-text text-base font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Se connecter
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('creds')}
                    className="flex h-12 w-full items-center justify-center text-sm font-semibold text-text-muted"
                  >
                    ← Changer d&apos;email
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="mt-12 text-xs text-text-faint">
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
}: {
  Icon: typeof Mail;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
        {label}
      </label>
      <div className="mt-2 flex h-14 items-center gap-3 rounded-2xl border border-border bg-bg-elev px-4 focus-within:border-primary">
        <Icon size={18} className="text-text-muted" strokeWidth={1.75} />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-base font-medium outline-none placeholder:text-text-faint"
        />
      </div>
    </div>
  );
}
