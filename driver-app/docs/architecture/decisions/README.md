# Architecture Decision Records

Every consequential choice gets an ADR — small, numbered, immutable once
accepted (supersede instead of editing). Agents read these to understand
_why_; humans read them to stop relitigating settled questions.

When an ADR is required: new dependency with architectural impact, changing
module boundaries, changing state/data patterns, build/release pipeline
changes, anything you'd otherwise explain twice.

- [Template](_template.md)
- [ADR-0001 — Feature-sliced architecture with enforced boundaries](0001-feature-sliced-architecture.md)
- [ADR-0002 — NativeWind 4 for styling](0002-nativewind-for-styling.md)
- [ADR-0003 — Zustand + Zod for state and validation](0003-zustand-zod-state.md)
- [ADR-0004 — AI harness: AGENTS.md + persona reviews + agentic QA](0004-ai-harness.md)
- [ADR-0005 — Spec-driven development: absorb the ideas, reject the ceremony](0005-spec-driven-development.md) _(superseded by ADR-0006)_
- [ADR-0006 — The Progix operating system: one front door, four surfaces, specs + skills](0006-progix-operating-system.md) _(four-surface model partially superseded by ADR-0008)_
- [ADR-0007 — Supabase as the backend, RLS-first](0007-supabase-backend.md)
- [ADR-0008 — Repo-only operating model (drop cloud CI/CD + Notion/Slack)](0008-repo-only-operating-model.md)
- [ADR-0009 — expo-camera for in-app QR scanning](0009-expo-camera-qr-scanning.md) _(proposed)_
