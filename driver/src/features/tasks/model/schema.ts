import { z } from 'zod';

/**
 * Domain schema — the contract for everything the feature stores or
 * receives. Validation at the edge (user input, storage rehydration,
 * API responses) is mandatory; see docs/conventions/code-style.md.
 */
export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, 'Title is required').max(200, 'Keep titles under 200 characters'),
  done: z.boolean(),
  createdAt: z.number().int().positive(),
});

export type Task = z.infer<typeof TaskSchema>;

export const TaskListSchema = z.array(TaskSchema);

export const TaskTitleSchema = TaskSchema.shape.title;
