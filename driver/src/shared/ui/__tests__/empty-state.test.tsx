import { fireEvent, render, screen } from '@/shared/testing/render';
import { Button, EmptyState } from '@/shared/ui';

describe('<EmptyState />', () => {
  it('renders title, description, and an action', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        testID="empty"
        title="No notes yet"
        description="Create your first note to get started."
        action={<Button label="New note" onPress={onPress} testID="empty-cta" />}
      />,
    );

    expect(screen.getByText('No notes yet')).toBeOnTheScreen();
    expect(screen.getByText('Create your first note to get started.')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('empty-cta'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
