import { selectPendingCount, useTasksStore } from '../model/store';

const initialState = useTasksStore.getState();

beforeEach(() => {
  useTasksStore.setState(initialState, true);
  useTasksStore.setState({ tasks: [] });
});

describe('tasks store', () => {
  it('adds a valid task to the top of the list', () => {
    const result = useTasksStore.getState().addTask('Write tests');
    expect(result.ok).toBe(true);

    useTasksStore.getState().addTask('Second task');
    const { tasks } = useTasksStore.getState();
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.title).toBe('Second task');
    expect(tasks[0]?.done).toBe(false);
  });

  it('rejects empty titles with a readable error', () => {
    const result = useTasksStore.getState().addTask('   ');
    expect(result).toEqual({ ok: false, error: 'Title is required' });
    expect(useTasksStore.getState().tasks).toHaveLength(0);
  });

  it('rejects titles over 200 characters', () => {
    const result = useTasksStore.getState().addTask('x'.repeat(201));
    expect(result.ok).toBe(false);
  });

  it('toggles completion', () => {
    useTasksStore.getState().addTask('Toggle me');
    const id = useTasksStore.getState().tasks[0]!.id;

    useTasksStore.getState().toggleTask(id);
    expect(useTasksStore.getState().tasks[0]?.done).toBe(true);

    useTasksStore.getState().toggleTask(id);
    expect(useTasksStore.getState().tasks[0]?.done).toBe(false);
  });

  it('removes a task and clears completed', () => {
    const store = useTasksStore.getState();
    store.addTask('A');
    store.addTask('B');
    store.addTask('C');

    const [c, b] = useTasksStore.getState().tasks;
    useTasksStore.getState().removeTask(b!.id);
    expect(useTasksStore.getState().tasks.map((t) => t.title)).toEqual(['C', 'A']);

    useTasksStore.getState().toggleTask(c!.id);
    useTasksStore.getState().clearCompleted();
    expect(useTasksStore.getState().tasks.map((t) => t.title)).toEqual(['A']);
  });

  it('computes pending count via selector', () => {
    useTasksStore.getState().addTask('One');
    useTasksStore.getState().addTask('Two');
    const id = useTasksStore.getState().tasks[0]!.id;
    useTasksStore.getState().toggleTask(id);

    expect(selectPendingCount(useTasksStore.getState())).toBe(1);
  });
});
