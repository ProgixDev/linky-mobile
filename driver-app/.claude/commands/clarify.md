---
description: Surface the ambiguities in a PRD that would change the implementation (bounded, not coverage-theater)
---

Input: $ARGUMENTS = path to a PRD in docs/product/prds/ (or a rough idea — draft
the PRD first, then clarify it).

Purpose: catch the ambiguities that cause rework — BEFORE planning. This is
deliberately bounded; verbose interrogation is worse than none
(see ADR-0005).

1. **Read the existing world first.** The PRD, docs/architecture/overview.md,
   the features it touches, and the CUJs. Most "open questions" are already
   answered by existing code or docs — never ask those.
2. **Find material ambiguities only.** An ambiguity is material if two
   reasonable implementations would differ user-visibly. Ignore everything
   else (edge-case poetry, hypothetical scale, "should it be robust").
3. **Ask at most 5 questions**, one batch, each with a recommended default so
   the human can answer in seconds. Use the AskUserQuestion tool when
   available; otherwise list them.
4. **Record the answers** in a `## Clarifications` section of the PRD
   (date + Q→A, one line each). Update acceptance criteria if an answer
   changes them.
5. If nothing is material, say exactly that — "No material ambiguities;
   ready for /plan-feature" — and stop. Zero questions is a success state,
   not a failure.

Skip this command entirely for spikes/painted doors when the user says so.
