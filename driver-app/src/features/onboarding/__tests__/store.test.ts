import { fetchApplicationStatus, submitApplication } from '../lib/onboarding-api';
import { useOnboardingStore } from '../model/store';
import type { ApplicationInput } from '../model/schema';

jest.mock('../lib/onboarding-api', () => ({
  fetchApplicationStatus: jest.fn(),
  submitApplication: jest.fn(),
}));

const mockFetch = fetchApplicationStatus as jest.Mock;
const mockSubmit = submitApplication as jest.Mock;

const validInput: ApplicationInput = {
  full_name: 'Mamadou Diallo',
  city: 'Conakry',
  vehicle_type: 'moto',
  id_photo_url: null,
  answers: {
    zones: 'Kaloum',
    availability: 'Lun–Sam',
    has_license_insurance: true,
    accepts_qr_process: true,
    accepts_linky_terms: true,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  useOnboardingStore.getState().reset();
});

describe('refresh (the gate call)', () => {
  it('stores the application status + reject reason on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 'rejected',
      rejectReason: 'Zone non couverte',
      application: null,
    });

    await useOnboardingStore.getState().refresh();

    const s = useOnboardingStore.getState();
    expect(s.phase).toBe('ready');
    expect(s.appStatus).toBe('rejected');
    expect(s.rejectReason).toBe('Zone non couverte');
  });

  it('surfaces an error/retry screen on a cold failure with nothing known', async () => {
    mockFetch.mockResolvedValue({ ok: false, kind: 'offline', message: 'Connexion impossible' });

    await useOnboardingStore.getState().refresh();

    expect(useOnboardingStore.getState().phase).toBe('error');
  });

  it('keeps a known status on a transient failure (no eject from pending)', async () => {
    useOnboardingStore.setState({ phase: 'ready', appStatus: 'pending' });
    mockFetch.mockResolvedValue({ ok: false, kind: 'offline', message: 'Connexion impossible' });

    await useOnboardingStore.getState().refresh();

    const s = useOnboardingStore.getState();
    expect(s.phase).toBe('ready');
    expect(s.appStatus).toBe('pending');
  });
});

describe('submit', () => {
  it('moves to pending on a successful submission', async () => {
    mockSubmit.mockResolvedValue({ ok: true, application: { id: 'a1' } });

    const result = await useOnboardingStore.getState().submit(validInput);

    expect(result).toEqual({ ok: true });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(useOnboardingStore.getState().appStatus).toBe('pending');
  });

  it('rejects client-side when the two « acceptes-tu » are not both oui (no network)', async () => {
    const result = await useOnboardingStore.getState().submit({
      ...validInput,
      answers: { ...validInput.answers, accepts_linky_terms: false },
    });

    expect(result.ok).toBe(false);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('treats APPLICATION_PENDING as already-submitted → pending', async () => {
    mockSubmit.mockResolvedValue({ ok: false, kind: 'pending_exists', message: 'Déjà en cours.' });

    const result = await useOnboardingStore.getState().submit(validInput);

    expect(result).toEqual({ ok: true });
    expect(useOnboardingStore.getState().appStatus).toBe('pending');
  });

  it('treats ALREADY_LIVREUR as approved → home unlocks', async () => {
    mockSubmit.mockResolvedValue({ ok: false, kind: 'already_livreur', message: 'Déjà livreur.' });

    await useOnboardingStore.getState().submit(validInput);

    expect(useOnboardingStore.getState().appStatus).toBe('approved');
  });

  it('surfaces a real failure message and stays put', async () => {
    mockSubmit.mockResolvedValue({ ok: false, kind: 'invalid', message: 'Corps invalide.' });

    const result = await useOnboardingStore.getState().submit(validInput);

    expect(result).toEqual({ ok: false, error: 'Corps invalide.' });
    expect(useOnboardingStore.getState().error).toBe('Corps invalide.');
  });
});

describe('reapply', () => {
  it('sends a rejected courier back to the form', () => {
    useOnboardingStore.setState({ appStatus: 'rejected', rejectReason: 'x', phase: 'ready' });

    useOnboardingStore.getState().reapply();

    expect(useOnboardingStore.getState().appStatus).toBe('none');
    expect(useOnboardingStore.getState().rejectReason).toBeNull();
  });
});
