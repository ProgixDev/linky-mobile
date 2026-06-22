import { Text } from 'react-native';

import { render, screen } from '@/shared/testing/render';
import { Card } from '@/shared/ui';

describe('<Card />', () => {
  it('renders its children and exposes a testID', () => {
    render(
      <Card testID="card">
        <Text>Inside</Text>
      </Card>,
    );

    expect(screen.getByTestId('card')).toBeOnTheScreen();
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });
});
