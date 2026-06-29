import { fetchAvailability, setAvailability } from '../lib/availability-api';
import { useAvailabilityStore } from '../model/store';

jest.mock('../lib/availability-api', () => ({
  fetchAvailability: jest.fn(),
  setAvailability: jest.fn(),
}));
const mockFetch = fetchAvailability as jest.Mock;
const mockSet = setAvailability as jest.Mock;

const initial = useAvailabilityStore.getState();

beforeEach(() => {
  mockFetch.mockReset();
  mockSet.mockReset();
  useAvailabilityStore.setState(initial, true);
});

describe('availability store', () => {
  it('load reads the current online state', async () => {
    mockFetch.mockResolvedValue({ ok: true, online: true });

    await useAvailabilityStore.getState().load();

    expect(useAvailabilityStore.getState().online).toBe(true);
  });

  it('load keeps the prior value when the read fails', async () => {
    useAvailabilityStore.setState({ online: true });
    mockFetch.mockResolvedValue({ ok: false });

    await useAvailabilityStore.getState().load();

    expect(useAvailabilityStore.getState().online).toBe(true);
    expect(useAvailabilityStore.getState().error).toBe('load');
  });

  it('setOnline flips optimistically and keeps it on success', async () => {
    mockSet.mockResolvedValue(true);

    await useAvailabilityStore.getState().setOnline(true);

    expect(useAvailabilityStore.getState().online).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(true);
  });

  it('setOnline reverts when the server rejects', async () => {
    useAvailabilityStore.setState({ online: false });
    mockSet.mockResolvedValue(false);

    await useAvailabilityStore.getState().setOnline(true);

    expect(useAvailabilityStore.getState().online).toBe(false); // reverted
    expect(useAvailabilityStore.getState().error).toBe('save');
  });
});
