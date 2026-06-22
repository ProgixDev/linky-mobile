import { TasksScreen } from '@/features/tasks';

/**
 * The kept demo slice (canonical reference pattern). Moved off `/` when the
 * driver deliveries list became the home screen (spec 001).
 */
export default function TasksRoute() {
  return <TasksScreen />;
}
