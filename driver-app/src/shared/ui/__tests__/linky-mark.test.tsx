import { render, screen } from '@/shared/testing/render';
import { LinkyMark } from '@/shared/ui';

describe('<LinkyMark />', () => {
  it('renders the brand mark with its testID', () => {
    render(<LinkyMark testID="brand" />);
    expect(screen.getByTestId('brand')).toBeOnTheScreen();
  });

  it('accepts a custom size without crashing', () => {
    render(<LinkyMark size={120} testID="brand-lg" />);
    expect(screen.getByTestId('brand-lg')).toBeOnTheScreen();
  });
});
