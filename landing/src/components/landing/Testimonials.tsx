import { Star } from 'lucide-react';

interface Quote {
  name: string;
  role: string;
  text: string;
  rating: 5;
  initials: string;
  tint: string;
}

const QUOTES: Quote[] = [
  {
    name: 'Mariama Diallo',
    role: 'Acheteuse · Conakry',
    text: 'J\'ai trouvé mon appartement à Lambanyi en 3 jours. La visite vidéo m\'a évité de perdre du temps. Tout s\'est passé via l\'app, paiement compris.',
    rating: 5,
    initials: 'MD',
    tint: '#E8F2EE',
  },
  {
    name: 'Aïssatou Bah',
    role: 'Vendeuse · Maison Aïssatou',
    text: 'Mes ventes ont triplé depuis que je suis sur Linky. Le badge "Vérifié" rassure les clientes, et les paiements arrivent vite sur mon Orange Money.',
    rating: 5,
    initials: 'AB',
    tint: '#FCF1DC',
  },
  {
    name: 'Ibrahima Sow',
    role: 'Diaspora · Paris',
    text: 'Je peux envoyer un cadeau à ma mère à Conakry sans déranger personne. Carte bancaire, paiement en €, livraison rapide. Bluffant.',
    rating: 5,
    initials: 'IS',
    tint: '#E4ECF6',
  },
];

export function Testimonials() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center rounded-full border border-border bg-bg-elev px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
            Avis utilisateurs
          </div>
          <h2 className="font-display mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            Ils nous font confiance.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {QUOTES.map((q) => (
            <div
              key={q.name}
              className="rounded-3xl border border-border bg-card p-7"
            >
              <div className="flex gap-1">
                {Array.from({ length: q.rating }).map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    fill="#E8A53D"
                    color="#E8A53D"
                    strokeWidth={0}
                  />
                ))}
              </div>
              <p className="mt-5 text-[15px] leading-relaxed text-text">
                « {q.text} »
              </p>
              <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-text"
                  style={{ background: q.tint }}
                >
                  {q.initials}
                </div>
                <div>
                  <div className="text-sm font-bold">{q.name}</div>
                  <div className="text-xs text-text-muted">{q.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
