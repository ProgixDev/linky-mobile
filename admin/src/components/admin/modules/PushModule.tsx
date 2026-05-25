'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Send, Smartphone, Calendar, Users, Bell } from 'lucide-react';
import { pushData } from '@/data/mock';

const schema = z.object({
  title: z.string().min(3).max(60),
  body: z.string().min(8).max(160),
  audience: z.enum(['all', 'buyers', 'sellers', 'agents']),
  scheduled: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function PushModule() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: 'Tabaski : des promos limitées',
      body: 'Les meilleures boutiques ont préparé leurs offres. Découvre dès maintenant.',
      audience: 'buyers',
      scheduled: '',
    },
  });
  const values = watch();

  const onSubmit = (v: FormValues) => {
    toast.success(
      v.scheduled
        ? `Push planifiée pour ${v.scheduled}`
        : 'Push envoyée à l\'audience cible',
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="rounded-2xl border border-border bg-bg-elev p-6">
          <div className="text-xs font-bold uppercase tracking-wider text-text-faint">
            Nouvelle notification
          </div>

          <div className="mt-5 space-y-4">
            <Field label="Titre" error={errors.title?.message}>
              <input
                {...register('title')}
                maxLength={60}
                className="h-12 w-full rounded-xl border border-border bg-bg-elev px-4 text-sm font-semibold outline-none focus:border-primary"
              />
              <div className="mt-1 text-right text-[10px] text-text-faint tabular-nums">
                {values.title?.length ?? 0}/60
              </div>
            </Field>

            <Field label="Corps" error={errors.body?.message}>
              <textarea
                {...register('body')}
                rows={3}
                maxLength={160}
                className="w-full resize-none rounded-xl border border-border bg-bg-elev px-4 py-3 text-sm outline-none focus:border-primary"
              />
              <div className="mt-1 text-right text-[10px] text-text-faint tabular-nums">
                {values.body?.length ?? 0}/160
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Audience" error={errors.audience?.message}>
                <select
                  {...register('audience')}
                  className="h-12 w-full rounded-xl border border-border bg-bg-elev px-4 text-sm font-semibold outline-none focus:border-primary"
                >
                  <option value="all">Tous (18 420)</option>
                  <option value="buyers">Acheteurs (12 850)</option>
                  <option value="sellers">Vendeurs (3 240)</option>
                  <option value="agents">Agents immo (820)</option>
                </select>
              </Field>
              <Field label="Programmer (optionnel)">
                <input
                  type="datetime-local"
                  {...register('scheduled')}
                  className="h-12 w-full rounded-xl border border-border bg-bg-elev px-4 text-sm font-semibold outline-none focus:border-primary"
                />
              </Field>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-text text-sm font-bold text-bg hover:opacity-90"
              >
                {values.scheduled ? (
                  <>
                    <Calendar size={15} /> Planifier
                  </>
                ) : (
                  <>
                    <Send size={15} /> Envoyer maintenant
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Recent */}
        <div className="rounded-2xl border border-border bg-bg-elev p-6">
          <div className="text-xs font-bold uppercase tracking-wider text-text-faint">
            Campagnes récentes
          </div>
          <div className="mt-4 space-y-3">
            {pushData.map((p) => {
              const sent = p.status === 'sent';
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-bg-sunken/40 p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Bell size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{p.title}</div>
                    <div className="text-xs text-text-muted">
                      {sent
                        ? `${p.sent} envoyées · ${p.opened} ouvertes (${
                            p.opened && p.sent
                              ? Math.round((p.opened / p.sent) * 100)
                              : 0
                          } %)`
                        : `Planifiée pour ${p.scheduled}`}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      sent
                        ? 'bg-success/12 text-success'
                        : 'bg-accent-soft text-accent-text'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </form>

      {/* Phone preview */}
      <div className="sticky top-0">
        <div className="rounded-2xl border border-border bg-bg-elev p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-faint">
            <Smartphone size={13} />
            Aperçu sur l&apos;écran verrouillé
          </div>
          <div className="mt-4 flex justify-center">
            <div className="relative rounded-[40px] bg-black p-2.5 shadow-[var(--shadow-pop)]">
              <div className="relative h-[520px] w-[260px] overflow-hidden rounded-[32px] bg-gradient-to-b from-[#1a2b1f] to-[#0E1311]">
                <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />

                <div className="flex h-full flex-col px-5 pt-16">
                  <div className="text-center text-white">
                    <div className="text-5xl font-bold">9:41</div>
                    <div className="mt-1 text-xs opacity-70">
                      vendredi 17 mai
                    </div>
                  </div>

                  {/* Notification card */}
                  <div className="mt-10 rounded-2xl bg-white/95 p-3 backdrop-blur-xl">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-primary">
                        <span className="text-[10px] font-bold text-white">L</span>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                        Linky
                      </span>
                      <div className="flex-1" />
                      <span className="text-[10px] text-text-muted">
                        maintenant
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-bold leading-tight">
                      {values.title || 'Titre…'}
                    </div>
                    <div className="mt-1 text-xs leading-snug text-text-muted">
                      {values.body || 'Contenu de la notification…'}
                    </div>
                  </div>

                  <div className="mt-auto mb-6 flex items-center justify-center gap-2 text-[10px] text-white/40">
                    <Users size={11} />
                    <span>
                      {values.audience === 'all'
                        ? '~ 18 420 destinataires'
                        : values.audience === 'buyers'
                          ? '~ 12 850 acheteurs'
                          : values.audience === 'sellers'
                            ? '~ 3 240 vendeurs'
                            : '~ 820 agents immo'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error && <div className="mt-1.5 text-xs text-danger">{error}</div>}
    </div>
  );
}
