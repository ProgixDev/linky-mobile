# Definition of Done

A change is **done** when every line below is true. The PR template mirrors this list; reviewers and agents enforce it. "Works on my machine" and "the agent said it's done" are not evidence.

## Every change (both tracks)

- [ ] `npm run verify` passes locally (format:check, lint, typecheck, test, docs:lint)
- [ ] Conventional commit(s); branch named per `docs/conventions/git-workflow.md`
- [ ] No new lint suppressions, `@ts-expect-error`s, `any` without `// why:`, or gate weakenings — or each one is justified in the PR description
- [ ] Tests updated/added: bug fixes carry a regression test; behavior changes update the tests that encode that behavior
- [ ] No secrets, PII, or `.env*` content anywhere in the diff
- [ ] Docs touched if behavior/structure changed (the doc you'd expect a newcomer to read must not lie)

## Feature track, additionally

- [ ] Spec exists in `specs/NNN-slug/` with acceptance criteria; plan + tasks completed (checkboxes ticked)
- [ ] Every acceptance criterion maps to a passing test (Jest/RNTL or Maestro) — the mapping is in `tasks.md`
- [ ] `/verify-ui` run: CUJ walked on the simulator (Argent/Maestro), screenshots captured and _looked at_
- [ ] `/review` run: persona P0/P1 findings fixed (P2s ticketed or consciously declined in the PR)
- [ ] `/feature-report` generated → `docs/reports/NNN-slug.md` linked in the PR
- [ ] After merge: `/update-docs` run — feature doc, CUJs, index current; spec marked shipped

## UI changes, additionally

- [ ] Empty, loading, and error states implemented and screenshotted
- [ ] Every interactive/assertable element has a `testID` (kebab-case, feature-prefixed)
- [ ] Accessibility: labels, roles, touch targets present
- [ ] Copy follows `docs/conventions/design-system.md` (typography gate green)
- [ ] Reduced-motion behavior verified for new animations; 60fps (no JS-thread loops)
- [ ] No hand edits to `ios/`/`android/` (CNG owns them)

## The spirit clause

If you find a way to satisfy the letter of this list while shipping something you wouldn't defend in demo, the harness has a bug: run `/encode-lesson` and close it.
