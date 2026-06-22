import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { selectPendingCount, selectTasks, useTasksStore } from '../model/store';
import { TaskRow } from './task-row';

/**
 * Example feature screen. It exists so every layer of the skeleton has a
 * living, tested reference implementation — copy its structure when
 * building real features (or run `npm run new:feature`).
 */
export function TasksScreen() {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tasks = useTasksStore(selectTasks);
  const pendingCount = useTasksStore(selectPendingCount);
  const addTask = useTasksStore((s) => s.addTask);
  const toggleTask = useTasksStore((s) => s.toggleTask);
  const removeTask = useTasksStore((s) => s.removeTask);

  const handleAdd = () => {
    const result = addTask(draft);
    if (result.ok) {
      setDraft('');
      setError(null);
    } else {
      setError(result.error);
    }
  };

  return (
    <Screen testID="tasks-screen">
      <View className="gap-1 pb-6 pt-4">
        <AppText variant="display">Tasks</AppText>
        <AppText variant="caption" testID="tasks-pending-count">
          {pendingCount === 0 ? 'All done 🎉' : `${pendingCount} pending`}
        </AppText>
      </View>

      <View className="flex-row items-center gap-3 pb-2">
        <TextField
          testID="tasks-input"
          placeholder="What needs doing?"
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (error) setError(null);
          }}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          accessibilityLabel="New task title"
        />
        <Button testID="tasks-add-button" label="Add" onPress={handleAdd} />
      </View>

      {error ? (
        <AppText variant="caption" className="pb-2 text-danger" testID="tasks-input-error">
          {error}
        </AppText>
      ) : null}

      <FlatList
        data={tasks}
        keyExtractor={(task) => task.id}
        renderItem={({ item, index }) => (
          <TaskRow task={item} index={index} onToggle={toggleTask} onRemove={removeTask} />
        )}
        ListEmptyComponent={
          <View className="items-center pt-16" testID="tasks-empty">
            <AppText variant="title" className="text-ink-faint">
              Nothing here yet
            </AppText>
            <AppText variant="caption">Add your first task above.</AppText>
          </View>
        }
        contentContainerClassName="pb-8"
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}
