import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { cn } from '@/shared/lib/cn';
import { AppText, Button } from '@/shared/ui';

import type { Task } from '../model/schema';

type Props = {
  task: Task;
  index: number;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
};

export function TaskRow({ task, index, onToggle, onRemove }: Props) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.delay(Math.min(index, 8) * 40)}
      exiting={reduced ? undefined : FadeOut}
      testID={`task-row-${task.id}`}
    >
      <View className="mb-2 flex-row items-center gap-3 rounded-card bg-surface-muted p-4">
        <Pressable
          testID={`task-toggle-${task.id}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.done }}
          accessibilityLabel={`Mark "${task.title}" as ${task.done ? 'not done' : 'done'}`}
          onPress={() => onToggle(task.id)}
          className={cn(
            'h-6 w-6 items-center justify-center rounded-full border-2',
            task.done ? 'border-success bg-success' : 'border-ink-faint',
          )}
        >
          {task.done ? <AppText className="text-xs text-ink-inverse">✓</AppText> : null}
        </Pressable>
        <AppText
          className={cn('flex-1', task.done && 'text-ink-faint line-through')}
          numberOfLines={2}
        >
          {task.title}
        </AppText>
        <Button
          testID={`task-delete-${task.id}`}
          label="Delete"
          variant="ghost"
          size="sm"
          accessibilityLabel={`Delete "${task.title}"`}
          onPress={() => onRemove(task.id)}
        />
      </View>
    </Animated.View>
  );
}
