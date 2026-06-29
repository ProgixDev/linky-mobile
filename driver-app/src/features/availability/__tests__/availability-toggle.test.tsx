import { fireEvent, render, screen, waitFor } from '@/shared/testing/render';

import { fetchAvailability, setAvailability } from '../lib/availability-api';
import { useAvailabilityStore } from '../model/store';
import { AvailabilityToggle } from '../ui/availability-toggle';

jest.mock('../lib/availability-api', () => ({
  fetchAvailability: jest.fn(),
  setAvailability: jest.fn(),
}));
const mockFetch = fetchAvailability as jest.Mock;
const mockSet = setAvailability as jest.Mock;

const initial = useAvailabilityStore.getState();

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue({ ok: true, online: false });
  mockSet.mockReset().mockResolvedValue(true);
  useAvailabilityStore.setState(initial, true);
});

describe('<AvailabilityToggle />', () => {
  it('loads the offline state, then goes online on tap', async () => {
    render(<AvailabilityToggle />);

    await waitFor(() => expect(screen.getByText('Hors ligne')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('availability-toggle'));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith(true));
    expect(screen.getByText('En ligne')).toBeOnTheScreen();
  });
});
