---
id: research-community-sentiment
read-when: You want the lived-experience / street-wisdom view (forums, HN, Reddit, Indie Hackers) behind the roadmap — what actually bites builders in our exact situation, not just official guidance.
owns: Community consensus on AI-coding security, shipping AI-built apps to stores, and how much harness/skeleton is "too much".
---

# Community & Forum Sentiment — AI use + security in our situation (2024–2026)

What practitioners building AI-assisted Expo/Next + Supabase apps actually experience and do.
Consensus vs contested flagged. This _validates and sharpens_ the roadmap — see "How this changes the plan".

## A. AI-coding security — the lived experience

**Secret leakage is the #1 concrete failure mode.**

- GitGuardian: **~28.6M new secrets leaked in public GitHub commits in 2025** (+34% YoY, largest jump on record). **Claude Code co-authored commits leaked a secret ~3.2% of the time — roughly double the human baseline.** "AI-generated code often looks production-ready before it is — and the gap gets filled with hardcoded API keys." ([Help Net / GitGuardian](https://www.helpnetsecurity.com/2026/04/14/gitguardian-ai-agents-credentials-leak/), [Register](https://www.theregister.com/2026/03/26/ai_coding_assistant_not_more_secure/))

**The Supabase leak story (the canonical cautionary tale for us).**

- SupaExplorer scanned 20,052 indie launch URLs: **11% exposed Supabase credentials** — worst cases shipped the **service_role key in the browser** or used the anon key against tables with **no RLS**. ([HN thread, 2026-01](https://news.ycombinator.com/item?id=46662304))
- **Supabase CEO replied in that thread** listing the platform's own anti-AI-mistake defenses, all worth mirroring in our skeleton: _"event triggers to enforce RLS on all tables · lints to scan for insecure rules · AI to write secure policies · big red labels when a table is exposed · weekly security emails · dashboard alerts and security advisors · [new] secret keys are auto-revoked if pushed to GitHub."_ ([kiwicopple, HN](https://news.ycombinator.com/item?id=46676584))
- Top-voted community sentiment: _"there's just no way around learning the underlying technology... No amount of AI will solve it, sorry, it's a harsh truth."_ and _"the vibe-coded ignorance is fractal"_ — one missing RLS policy usually signals many more. ([HN](https://news.ycombinator.com/item?id=46662304))

**Why AI code is insecure by default (consensus).** Pattern-completion, not security reasoning: agents **skip RLS on exposed schemas, create views without `security_invoker=true` (silently bypassing RLS), hallucinate CLI commands, and copy insecure patterns/hardcoded creds from training data.** "AI knows what SQLi/XSS/RLS are but doesn't apply them consistently." ([Supabase: AI Agents Know About Supabase. They Don't Always Use It Right.](https://supabase.com/blog/supabase-agent-skills))

**What practitioners actually DO (consensus habits):**

1. **Treat AI output like a junior dev's PR** — review everything, never auto-trust.
2. **RLS-first / deny-by-default**; always review AI-generated migrations and **test in a dev branch before applying**.
3. **Inline security checklist inside the skill** so the agent "has no excuse to miss" requirements. ([Supabase](https://supabase.com/blog/supabase-agent-skills))
4. **Plan mode → read the relevant docs → ask 3–5 clarifying questions about edge cases/security → then propose a plan.** ([Supabase](https://supabase.com/blog/supabase-agent-skills))
5. **Automated scanning before PR:** secret scanners (gitleaks) + GitHub push protection, SAST/SCA (Semgrep, Socket, Snyk). Don't rely on the model to catch its own leaks.
6. **Short-lived/scoped credentials over static secrets**; never trust the client.
7. Run an **external pre-launch audit** (e.g. SupaExplorer's free Chrome extension / OAuth audit) as a sanity check.

- **Contested:** "is RLS enough?" — most say RLS is necessary but **not sufficient** (split sensitive columns into their own tables; add attestation/server checks for high-value actions). A minority argue heavy client hardening is theater for a small app — but nobody disputes RLS + no-secrets-in-bundle.

## B. Shipping AI-built apps to the stores — the lived experience

**Apple is actively cracking down on AI/"vibe-coded" apps right now (2026).**

- Vibe coding drove an **~84% jump in App Store submissions in one quarter**; review queues ballooned (community reports of multi-week waits). Apple is reviewing harder. ([TNW](https://thenextweb.com/news/vibe-coding-apple-app-store-surge-crackdown), [9to5Mac](https://9to5mac.com/2026/03/18/apple-pushing-back-on-vibe-coding-iphone-apps-developers-say/))
- Apple blocked updates for Replit/Vibecode citing **Guideline 2.5.2** (apps must be self-contained, can't download/execute code that changes functionality) and **License 3.3.1(B)**. The line: fine to _build_ with AI, not fine to ship apps where **"AI did nearly all the work and no experienced developer reviewed the result."** ([9to5Mac](https://9to5mac.com/2026/03/18/apple-pushing-back-on-vibe-coding-iphone-apps-developers-say/), [The Information via 9to5Mac])
- Knock-on: _"Investors now want to see the code before they write checks. When they discover the product is vibe-coded, they're declining the deal."_ ([TNW](https://thenextweb.com/news/vibe-coding-apple-app-store-surge-crackdown))

**Implication for us:** the bar isn't "did it compile" — it's **"does it look and behave like a human professional shipped it."** That means: completeness (no placeholders/dead buttons), genuine differentiation (dodge 4.3 clone), a live backend + demo account, accurate metadata, and the privacy/account-deletion machinery filled in. Our Phase 3 (store rule base + `/store-readiness` audit + "no soon" lint + originality gate) is aimed squarely at this — and it's now _more_ urgent than when we wrote it.

## C. How much harness/skeleton is "too much" — the lived experience

**CLAUDE.md / rules: keep them SHORT.**

- _"Your CLAUDE.md should contain as few instructions as possible... As instruction count increases, instruction-following quality decreases uniformly."_ Frontier models reliably follow only **~150–200 instructions**; Claude Code's own system prompt already uses ~50. Claude **ignores CLAUDE.md content it judges irrelevant**, so bloat actively hurts. Lean on **in-context learning from existing code patterns** instead of stuffing rules. ([HumanLayer: Writing a good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md))

**Skeletons/boilerplate: lean beats mega.**

- Indie Hackers consensus: feature-rich templates get abandoned — _"bloated with things they didn't need,"_ _"too many dependencies,"_ and _"the time it takes to tweak the template negates the savings."_ Winners are **lean, personally-tailored** starters that reuse auth/db utilities + folder structure and **generate the rest on demand.** ([Indie Hackers: do you use boilerplate](https://www.indiehackers.com/post/do-you-use-boilerplate-to-launch-new-projects-1cd9242a42), [what boilerplate do you use](https://www.indiehackers.com/post/what-saas-boilerplate-do-you-use-04aab3cc3b))
- This **directly validates** our "lean core + `/new-component` generator" decision over a big pre-built library.

## How this changes the plan (deltas, not a rewrite)

1. **Store compliance is now existential, not hygiene.** Apple is actively rejecting AI-built apps under 2.5.2 / 4.3 / 2.1. Keep Phase 3 high-priority; add **Guideline 2.5.2** to the rule base and make "a human reviewed this + it's differentiated + it's complete" the framing of `/store-readiness`.
2. **Mirror Supabase's own anti-AI defenses** in Phase 2: RLS-enforcing **event trigger**, advisor **lints as release gates**, **build-time secret-in-bundle grep guard**, and a **plan-mode + 3–5 security clarifying-questions ritual** before any DB/migration work.
3. **Secret scanning is table stakes** (Phase 1): gitleaks pre-commit + push protection + the bundle grep guard — because AI doubles the leak rate.
4. **Don't over-document (Phase 5 guardrail).** Keep CLAUDE.md/AGENTS.md tiny; push detail into **path-scoped skills + `references/` rule files loaded on demand**, and rely on consistent code patterns. Resist the urge to grow the docs tree for its own sake.
5. **Bake the "treat AI as a junior dev" loop into the harness:** `/security-review` with an inline checklist that cites rule IDs, run before merge — the single most-recommended community habit.
6. **Add an external pre-launch audit step** to the submission runbook (SupaExplorer-style RLS/secret scan) as an independent check on the agent's own work.

**Sources:** [HN: 11% of vibe-coded apps leaking Supabase keys](https://news.ycombinator.com/item?id=46662304) · [Supabase CEO reply](https://news.ycombinator.com/item?id=46676584) · [Supabase: agents don't always use it right](https://supabase.com/blog/supabase-agent-skills) · [GitGuardian/Help Net](https://www.helpnetsecurity.com/2026/04/14/gitguardian-ai-agents-credentials-leak/) · [Register: AI code not more secure](https://www.theregister.com/2026/03/26/ai_coding_assistant_not_more_secure/) · [9to5Mac: Apple pushback](https://9to5mac.com/2026/03/18/apple-pushing-back-on-vibe-coding-iphone-apps-developers-say/) · [TNW: crackdown](https://thenextweb.com/news/vibe-coding-apple-app-store-surge-crackdown) · [HumanLayer: good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) · [Indie Hackers: boilerplate](https://www.indiehackers.com/post/do-you-use-boilerplate-to-launch-new-projects-1cd9242a42)
