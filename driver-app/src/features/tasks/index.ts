/**
 * PUBLIC API of the tasks feature.
 * Everything not exported here is internal — the boundaries lint rule
 * blocks deep imports from outside this folder.
 */
export { TasksScreen } from './ui/tasks-screen';
export { useTasksStore, selectPendingCount } from './model/store';
export type { Task } from './model/schema';
