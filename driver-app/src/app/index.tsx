import { DeliveriesScreen } from '@/features/deliveries';

/**
 * Routes stay THIN. A route file only wires a URL to a feature's screen —
 * business logic, state and UI live in src/features/.
 * See docs/architecture/module-boundaries.md
 *
 * Home = the driver's worklist (their assigned deliveries). The kept `tasks`
 * demo now lives at /tasks.
 */
export default function HomeRoute() {
  return <DeliveriesScreen />;
}
