# PRD-NNNN — Title

- **Status:** draft | approved | shipped
- **Size:** M | L (S-size work needs no PRD — see ADR-0005 sizing gate)
- **Author / Date:**
- **Owner squad:**
- **Links:** issue, designs (Figma), exec plan (added when implementation starts)

## Problem

Who hurts, how much, evidence. (3–6 sentences, no solutioning.)

## Goal & success metric

The single user-observable outcome + the metric that proves it
(e.g. “% of sessions that capture ≥1 task in <10s”).

## Solution sketch

User-visible behavior, step by step. Reference design-system components by
name. Mark anything that is a painted door explicitly.

## Acceptance criteria (become tests)

- [ ] GIVEN … WHEN … THEN … (each line maps to a Jest/RNTL test or Maestro step)
- [ ] Error/empty/loading states defined
- [ ] Accessibility: labels, roles, touch targets
- [ ] testIDs listed for new interactive elements

## Non-goals

What we deliberately exclude this iteration.

## Clarifications

Material Q→A recorded by `/clarify` (one line each, dated). Empty is fine —
zero questions is a success state, not a gap.

## Proof

What the PR's demo must show (screens/recording/Argent transcript) for PM to
accept.

## Rollout

Flag? Painted door? OTA-only or store build (any native deps)? Telemetry to watch.
