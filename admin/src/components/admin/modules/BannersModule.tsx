'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Megaphone, Calendar, Smartphone, Users, Send, Sparkles } from 'lucide-react';
// V1.1 — this module is NOT routed (route + sidebar entry removed in the
// final-sprint mock purge). Local sample data so no app code imports
// @/data/mock ; becomes a real fetcher when the banners backend lands.
interface Banner {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  audience: 'all' | 'buyers' | 'sellers' | 'agents';
  status: 'live' | 'scheduled' | 'draft';
  startsAt: string;
  endsAt: string;
}

const bannersData: Banner[] = [
  {
    id: 'b1',
    title: 'Black Friday — -30 %',
    body: "Jusqu'à -30 % sur l'électronique. Du 25 au 30 novembre.",
    ctaLabel: 'Voir les offres',
    audience: 'buyers',
    status: 'scheduled',
    startsAt: '25/11/2026',
    endsAt: '30/11/2026',
  },
];

const schema = z.object({
  title: z.string().min(3, '3 caractères minimum'),
  body: z.string().min(8, '8 caractères minimum').max(140),
  cta: z.string().min(2),
  audience: z.enum(['all', 'buyers', 'sellers', 'agents']),
  startsAt: z.string(),
  endsAt: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function BannersModule() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: 'Black Friday — -30 %',
      body: 'Jusqu\'à -30 % sur l\'électronique. Du 25 au 30 novembre.',
      cta: 'Voir les offres',
      audience: 'buyers',
      startsAt: '2026-11-25',
      endsAt: '2026-11-30',
    },
  });
  const values = watch();

  const onSubmit = (v: FormValues) => {
    toast.success(`Bannière "${v.title}" planifiée`);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <div className="text-xs font-bold uppercase tracking-wider text-faint">
            Composer
          </div>

          <div className="mt-5 space-y-4">
            <Field label="Titre" error={errors.title?.message}>
              <input
                {...register('title')}
                className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-sm font-semibold outline-none focus:border-primary"
              />
            </Field>

            <Field label="Contenu" error={errors.body?.message}>
              <textarea
                {...register('body')}
                rows={3}
                className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Libellé du bouton" error={errors.cta?.message}>
                <input
                  {...register('cta')}
                  className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-sm font-semibold outline-none focus:border-primary"
                />
              </Field>
              <Field label="Audience" error={errors.audience?.message}>
                <select
                  {...register('audience')}
                  className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-sm font-semibold outline-none focus:border-primary"
                >
                  <option value="all">Tout le monde</option>
                  <option value="buyers">Acheteurs</option>
                  <option value="sellers">Vendeurs</option>
                  <option value="agents">Agents immo</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Début" error={errors.startsAt?.message}>
                <input
                  type="date"
                  {...register('startsAt')}
                  className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-sm font-semibold outline-none focus:border-primary"
                />
              </Field>
              <Field label="Fin" error={errors.endsAt?.message}>
                <input
                  type="date"
                  {...register('endsAt')}
                  className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-sm font-semibold outline-none focus:border-primary"
                />
              </Field>
            </div>

            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-black text-sm font-bold text-white hover:opacity-90"
            >
              <Calendar size={15} />
              Planifier la bannière
            </button>
          </div>
        </div>

        {/* Existing banners */}
        <div className="rounded-2xl border border-line bg-surface p-6">
          <div className="text-xs font-bold uppercase tracking-wider text-faint">
            Bannières actuelles
          </div>
          <div className="mt-4 space-y-3">
            {bannersData.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-sunken/40 p-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
                  <Megaphone size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{b.title}</div>
                  <div className="text-xs text-muted">
                    {b.startsAt} → {b.endsAt}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    b.status === 'live'
                      ? 'bg-success/12 text-success'
                      : b.status === 'scheduled'
                        ? 'bg-accent-soft text-accent-text'
                        : 'bg-sunken text-muted'
                  }`}
                >
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </form>

      {/* Phone preview */}
      <div className="sticky top-0">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-faint">
            <Smartphone size={13} />
            Aperçu mobile
          </div>
          <div className="mt-4 flex justify-center">
            <div className="relative rounded-[40px] bg-black p-2.5 shadow-[var(--shadow-pop)]">
              <div className="relative h-[520px] w-[260px] overflow-hidden rounded-[32px] bg-[#F7F3EC]">
                <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />

                <div className="flex h-full flex-col p-5 pt-12">
                  <div className="text-xs text-muted">Bonjour,</div>
                  <div className="text-base font-bold">Mariama</div>

                  {/* Banner preview */}
                  <div className="grain mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#118866] via-[#0A5240] to-[#063929] p-4 text-white">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={11} className="text-accent" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-accent">
                        Promo
                      </span>
                    </div>
                    <div className="mt-2 text-base font-bold leading-tight">
                      {values.title || 'Titre…'}
                    </div>
                    <div className="mt-1.5 text-[11px] text-white/75">
                      {values.body || 'Contenu de la bannière…'}
                    </div>
                    <button className="mt-3 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[#0A5240]">
                      {values.cta || 'Action'}
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-[10px] text-muted">
                    <Users size={11} />
                    <span>
                      Audience :{' '}
                      {values.audience === 'all'
                        ? 'tout le monde'
                        : values.audience === 'buyers'
                          ? 'acheteurs'
                          : values.audience === 'sellers'
                            ? 'vendeurs'
                            : 'agents immo'}
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
      <label className="text-[11px] font-bold uppercase tracking-wider text-faint">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error && <div className="mt-1.5 text-xs text-danger">{error}</div>}
    </div>
  );
}
