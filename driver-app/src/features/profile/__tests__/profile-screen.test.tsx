import { render, screen, waitFor } from '@/shared/testing/render';

import { fetchProfile } from '../lib/profile-api';
import { useProfileStore } from '../model/store';
import { ProfileScreen } from '../ui/profile-screen';

jest.mock('../lib/profile-api', () => ({
  fetchProfile: jest.fn(),
  saveProfile: jest.fn(),
}));
const mockFetch = fetchProfile as jest.Mock;

const initial = useProfileStore.getState();
beforeEach(() => {
  mockFetch.mockReset();
  useProfileStore.setState(initial, true);
});

describe('<ProfileScreen />', () => {
  it('renders an APPROVED profile (the just-approved-driver case) without crashing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      view: {
        fullName: 'Chouaib',
        city: 'Conakry',
        vehicleType: 'voiture',
        idPhotoUrl: null,
        approved: true,
      },
    });

    render(<ProfileScreen onSignOut={jest.fn()} />);

    expect(await screen.findByText('Chouaib')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-approved-badge')).toBeOnTheScreen();
  });

  it('renders the error state when the profile fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, message: 'down' });
    render(<ProfileScreen onSignOut={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('profile-error')).toBeOnTheScreen());
  });
});
