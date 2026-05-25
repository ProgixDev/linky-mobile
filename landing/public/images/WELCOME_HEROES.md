# Welcome screen heroes — image brief

Three full-bleed hero photos that play in the welcome carousel of the Linky mobile app. Each pairs with French copy that sells one of Linky's three pillars: **marché**, **immobilier**, **paiement sécurisé**.

The welcome screen layout: photo fills the top 55% of the device, the logo sits centered over the top edge, the cream card `#F0E0CF` rises into a curved cutout at the bottom of the photo. Plan compositions accordingly — the bottom ~10% of each photo will be partially covered by the curve, and the top ~12% will sit behind the 64×64 app icon.

---

## File specs

| Property | Value |
|---|---|
| Dimensions | **1170 × 1392 px** (3× iPhone hero area, 5:6 aspect — taller than wide) |
| Format | PNG-24, sRGB, no transparency |
| File size | ≤ 400 KB each (compress before commit) |
| Output paths | `app-mobile/assets/images/welcome-1.png`, `welcome-2.png`, `welcome-3.png` |
| Color profile | sRGB IEC61966-2.1 |

A version at **2340 × 2784** (5×) is acceptable if you want to ship one master and let Expo resize. Otherwise stick to 3× and keep PNGs lean.

## Safe zones (do NOT put critical subject matter here)

- **Top 12%** — the brand logo (64×64) is overlaid here. Don't put a face or focal point in this band.
- **Bottom 10%** — covered by the curved cream cutout that bridges into the card. Faces, text, or product details placed here will be cut off.
- **Center 50%** — this is the hero zone. The viewer's eye lands here. The main subject belongs here.

## Visual style (applies to all three)

- **Mood**: warm, optimistic, sunlit. Mid-morning to golden-hour Conakry light. Avoid harsh midday shadows.
- **Color palette**: dominant warm cream / sand / terracotta, accented with Linky emerald `#0E6E55` and saffron `#E8A53D`. Reject cool blue tones — they fight the brand cream `#F0E0CF`.
- **People**: West African / Guinean. Authentic, not stocky. Real expressions over staged smiles. Diverse ages and genders across the three slides.
- **Composition**: shallow depth of field where possible — keep one clear subject, blur the rest. Rule of thirds for primary subject.
- **Quality**: editorial-grade. No iStock-grid plastic-smile compositions. Think Apple campaign meets Conakry street style.
- **Treatment**: subtle warm tone curve. Slight S-curve contrast. Avoid heavy filters or grain.

## Aspect & framing notes

- **Vertical** orientation. The hero is taller than wide.
- Subject framed comfortably with breathing room — not cramped.
- Camera height around eye-level. Avoid drone / aerial shots; they feel disconnected from the everyday-Guinea pitch.

---

## Image 1 — "Bienvenue · Marché"

**French copy paired with it:**
> **Bienvenue**
> Achète, vends et loue partout en Guinée.

**Brief**: A Guinean marketplace scene. A young female vendor (20s-30s) at her stall, smiling warmly at the camera. Stall has colorful wax fabrics, beauty products, or fresh produce — something that feels **commerce**, not poverty. She's confident, in charge of her business. Mobile phone visible in her hand or on the stall (subtle nod to the Linky digital layer).

**Mood**: pride, hustle, warmth.
**Palette accents**: bright wax patterns, saffron + emerald accents in the fabric/produce. Cream-toned background (woven mat, wooden stall) — should blend nicely into the `#F0E0CF` card cutout.
**Negative space**: top quarter of the frame should be lighter / less detailed (so the logo reads cleanly).

**Output**: `welcome-1.png`

---

## Image 2 — "Ta maison · Immobilier"

**French copy paired with it:**
> **Ta maison t'attend**
> Loue ou achète ton prochain logement, vérifié et sécurisé.

**Brief**: An interior or exterior architectural shot of a desirable Conakry apartment or villa. Sun streaming through a balcony, a tidy modern living room with West African design touches (woven baskets, wax-print throw, terracotta plant pot). Could also work as exterior: a modern Conakry villa with iron gate, palm tree, late-afternoon light.

**Alternative**: a young couple or single woman looking out of a sunlit window at the city — but without showing their face prominently (back-of-head / silhouette is fine). Helps the viewer project themselves into the home.

**Mood**: aspiration, calm, "this could be yours."
**Palette accents**: terracotta, cream, soft emerald plants. Avoid stark white modern interiors — they feel European and disconnect from Guinea.
**Negative space**: top quarter sky / ceiling — let the logo breathe.

**Output**: `welcome-2.png`

---

## Image 3 — "Paie en sécurité · Paiement"

**French copy paired with it:**
> **Paie en sécurité**
> Orange Money, MTN ou carte.
> Le vendeur est payé après ta confirmation.

**Brief**: A close-up scene of a phone-based payment moment. A pair of hands — one holding a smartphone showing a mobile money confirmation, the other receiving / handing over a small package or product. Could also be a person beaming at their phone after a successful purchase. The Orange Money orange and MTN yellow are NOT required in the shot — keep it brand-agnostic.

**Alternative**: an over-the-shoulder shot of someone confirming a purchase on their phone, with a wax-print fabric or product visible in front of them. Soft focus on the screen so no real UI shows.

**Mood**: trust, ease, modern Africa.
**Palette accents**: saffron warmth, cream skin tones, subtle emerald (a green checkmark glow from the phone screen is fine).
**Negative space**: bottom edge can have phone or hands; **keep top quarter open** for the logo.

**Output**: `welcome-3.png`

---

## Integrating them

Once the three PNGs are dropped into `app-mobile/assets/images/`:

```ts
// src/data/photos.ts — add at the top
export const welcomeHeroes = {
  marche: require('../../assets/images/welcome-1.png'),
  immobilier: require('../../assets/images/welcome-2.png'),
  paiement: require('../../assets/images/welcome-3.png'),
};
```

Then in `app/(onboarding)/welcome.tsx`, swap the `hero` field of each slide:

```ts
import { welcomeHeroes } from '../../src/data/photos';

const SLIDES = [
  { hero: welcomeHeroes.marche,      title: 'Bienvenue', sub: '...' },
  { hero: welcomeHeroes.immobilier,  title: "Ta maison\nt'attend", sub: '...' },
  { hero: welcomeHeroes.paiement,    title: 'Paie en\nsécurité', sub: '...' },
];
```

Tell Metro to pick up the new assets with `npx expo start --clear`.

## AI generation prompts (if using Midjourney / Imagen / SDXL)

If you're feeding these into a generator, suggested prompt skeletons:

**Image 1**:
> Editorial portrait photography, young Guinean female market vendor smiling warmly, colorful wax fabric stall, Conakry marketplace, soft mid-morning sunlight, shallow depth of field, warm cream and terracotta palette with saffron accents, mobile phone on stall, authentic, optimistic, not stocky, 50mm lens, vertical composition, top of frame open and uncluttered, --ar 5:6 --style editorial

**Image 2**:
> Sunlit modern Conakry apartment interior, terracotta plant pots, wax-print throw on a low couch, balcony with late-afternoon golden light, warm cream and emerald palette, vertical composition, no people, architectural digest aesthetic but West African design language, --ar 5:6

**Image 3**:
> Close-up of West African hands holding a smartphone showing a mobile money confirmation screen with a green checkmark glow, second hand receiving a small wrapped package, warm cream and saffron palette, soft focus, editorial commercial photography, vertical composition, top of frame open, --ar 5:6

Adjust until the safe zones (top 12% + bottom 10%) stay free of critical subject matter.
