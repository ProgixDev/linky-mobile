import { render, screen } from '@/shared/testing/render';
import { Skeleton } from '@/shared/ui';

describe('<Skeleton />', () => {
  it('renders and announces a loading state to screen readers', () => {
    render(<Skeleton testID="skeleton" className="h-6 w-24" />);

    expect(screen.getByTestId('skeleton')).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });
});
