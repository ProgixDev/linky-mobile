import { fireEvent, render, screen } from '@/shared/testing/render';
import { Button } from '@/shared/ui';

describe('<Button />', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} testID="save" />);

    fireEvent.press(screen.getByTestId('save'));

    expect(screen.getByText('Save')).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks presses while loading and exposes busy state', () => {
    const onPress = jest.fn();
    render(<Button label="Save" loading onPress={onPress} testID="save" />);

    fireEvent.press(screen.getByTestId('save'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('save')).toBeDisabled();
    expect(screen.getByTestId('save')).toBeBusy();
  });
});
