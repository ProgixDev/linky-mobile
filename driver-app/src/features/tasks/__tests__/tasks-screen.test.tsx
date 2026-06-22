import { fireEvent, render, screen } from '@/shared/testing/render';

import { useTasksStore } from '../model/store';
import { TasksScreen } from '../ui/tasks-screen';

beforeEach(() => {
  useTasksStore.setState({ tasks: [] });
});

describe('<TasksScreen />', () => {
  it('shows the empty state initially', () => {
    render(<TasksScreen />);
    expect(screen.getByTestId('tasks-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('tasks-pending-count')).toHaveTextContent('All done 🎉');
  });

  it('adds a task through the input', () => {
    render(<TasksScreen />);

    fireEvent.changeText(screen.getByTestId('tasks-input'), 'Buy milk');
    fireEvent.press(screen.getByTestId('tasks-add-button'));

    expect(screen.getByText('Buy milk')).toBeOnTheScreen();
    expect(screen.queryByTestId('tasks-empty')).not.toBeOnTheScreen();
    expect(screen.getByTestId('tasks-pending-count')).toHaveTextContent('1 pending');
  });

  it('surfaces validation errors for empty input', () => {
    render(<TasksScreen />);

    fireEvent.press(screen.getByTestId('tasks-add-button'));

    expect(screen.getByTestId('tasks-input-error')).toHaveTextContent('Title is required');
  });

  it('toggles a task as done', () => {
    useTasksStore.getState().addTask('Ship it');
    const id = useTasksStore.getState().tasks[0]!.id;

    render(<TasksScreen />);
    fireEvent.press(screen.getByTestId(`task-toggle-${id}`));

    expect(screen.getByTestId('tasks-pending-count')).toHaveTextContent('All done 🎉');
  });

  it('deletes a task', () => {
    useTasksStore.getState().addTask('Temporary');
    const id = useTasksStore.getState().tasks[0]!.id;

    render(<TasksScreen />);
    fireEvent.press(screen.getByTestId(`task-delete-${id}`));

    expect(screen.queryByText('Temporary')).not.toBeOnTheScreen();
  });
});
