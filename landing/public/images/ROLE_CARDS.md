# Role Cards — Character Illustrations

Three character illustrations for the **Étape 3 / Rôle** screen of onboarding. When a role card is selected, the card expands and reveals the character image on the right side. When unselected, the card is collapsed and shows only the icon + label.

## Shared style brief

Use the same brief for all three images so the trio looks like a set.

- **Format**: square 1024×1024 PNG with a **fully transparent background** (no shadow on the ground).
- **Render style**: modern 3D character illustration, soft matte surfaces, gentle ambient lighting, very mild rim light from the upper-left. No harsh shadows. Slight stylization — friendly, approachable, not photorealistic.
- **Subject**: a young West African adult (Guinean) with warm dark brown skin, expressive eyes, a calm confident smile. Modern everyday clothes with a single accent of **emerald green (#0F7256)** somewhere on the outfit so all three feel connected. Avoid logos, text, or branded items.
- **Pose**: ¾ body framing (head + torso + hips), facing slightly toward the right of the frame so the character "leans into" the card content. Hands and props are visible.
- **Palette**: warm cream (#F7F3EC), emerald accent (#0F7256), deep emerald (#0A5240), saffron warmth (#E8B14F), and natural skin/hair tones. No neon, no purple/blue.
- **No background**: pure transparency around the character. Do not include ground, floor, wall, or environmental elements.

Provide three variants:

---

## 1. `role-acheteur.png` — Buyer (Acheteur)

> Modern 3D character illustration of a young Guinean woman in her late twenties with warm dark brown skin and a confident smile. She is holding two cream-colored paper shopping bags, one in each hand, slightly raised at hip height. She wears a clean cream blouse with a small emerald-green collar accent and casual trousers. Her hair is natural in a low puff. Soft matte rendering, mild upper-left rim light, gentle ambient occlusion, no harsh shadows. ¾ body framing, facing slightly to the right. Fully transparent background, no ground shadow, no logos, no text. Cohesive friendly West African e-commerce illustration style. 1024×1024.

**Intent**: communicates buying / shopping / discovering products on the app.

---

## 2. `role-vendeur.png` — Seller (Vendeur)

> Modern 3D character illustration of a young Guinean man in his late twenties with warm dark brown skin, short fade haircut, and a relaxed welcoming smile. He stands behind a small wooden product crate that he is holding open with both hands, revealing a folded textile and a small saffron-yellow box inside. He wears an emerald-green apron over a cream t-shirt. Soft matte rendering, mild upper-left rim light, gentle ambient occlusion, no harsh shadows. ¾ body framing, facing slightly to the right. Fully transparent background, no ground shadow, no logos, no text. Cohesive friendly West African e-commerce illustration style, matches a companion buyer illustration. 1024×1024.

**Intent**: communicates selling / showcasing one's own products / being a merchant.

---

## 3. `role-agent.png` — Real Estate Agent (Agent immo)

> Modern 3D character illustration of a young Guinean woman in her early thirties with warm dark brown skin and a poised professional smile. She holds a small architectural model of a modern house in her left hand at chest height; her right hand gestures gently toward it as if presenting. She wears a tailored cream blazer over a soft emerald-green top and structured trousers. Her hair is in neat shoulder-length braids. Soft matte rendering, mild upper-left rim light, gentle ambient occlusion, no harsh shadows. ¾ body framing, facing slightly to the right. Fully transparent background, no ground shadow, no logos, no text. Cohesive friendly West African real estate illustration style, matches companion buyer and seller illustrations. 1024×1024.

**Intent**: communicates real-estate / listing properties / professional agent.

---

## Recommended generators

- **Midjourney v6+** — best for cohesive character sets; use `--style raw --ar 1:1 --no background` and request transparent PNG export.
- **OpenAI gpt-image-1** (DALL·E successor) — natively supports transparent backgrounds; request "PNG with alpha channel".
- **Adobe Firefly** — good for cohesive style; use "Image" with "Transparent Background" toggle on.

## Drop location

Once generated, save the three PNGs as:

```
app-mobile/assets/images/role-acheteur.png
app-mobile/assets/images/role-vendeur.png
app-mobile/assets/images/role-agent.png
```

Then the `profile-setup` step-3 card component will reveal the matching image when the card is selected (expanded state) and hide it when collapsed.
