import { fireEvent, render, screen, waitFor } from '@/shared/testing/render';

import { submitApplication } from '../lib/onboarding-api';
import { useOnboardingStore } from '../model/store';
import { ApplicationFormScreen } from '../ui/application-form-screen';

jest.mock('../lib/onboarding-api', () => ({
  submitApplication: jest.fn(),
  fetchApplicationStatus: jest.fn(),
}));

// PhotoPicker's native deps — plain mocks so the real picker renders + the camera
// path resolves to a URL (face photo is required to leave step 1).
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchCameraAsync: jest.fn(() =>
    Promise.resolve({ canceled: false, assets: [{ uri: 'file://selfie.jpg' }] }),
  ),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  CameraType: { front: 'front', back: 'back' },
}));
jest.mock('@/shared/lib/photo-upload', () => ({
  uploadAvatar: jest.fn(() =>
    Promise.resolve({ ok: true, url: 'https://cdn.linky.gn/avatars/x.jpg' }),
  ),
}));

const mockSubmit = submitApplication as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useOnboardingStore.getState().reset();
  useOnboardingStore.setState({ phase: 'ready', appStatus: 'none' });
});

async function setPhoto() {
  fireEvent.press(screen.getByTestId('onboarding-photo-camera'));
  await screen.findByText('Reprendre'); // photo uploaded → label flips
}

async function completeStep1() {
  await setPhoto();
  fireEvent.changeText(screen.getByTestId('onboarding-fullname'), 'Mamadou Diallo');
  fireEvent.changeText(screen.getByTestId('onboarding-age'), '28');
  fireEvent.changeText(screen.getByTestId('onboarding-city'), 'Conakry');
  fireEvent.press(screen.getByTestId('onboarding-vehicle-moto'));
  fireEvent.press(screen.getByTestId('onboarding-next'));
}

function completeStep2() {
  fireEvent.changeText(screen.getByTestId('onboarding-zones'), 'Kaloum, Ratoma');
  fireEvent.press(screen.getByTestId('onboarding-day-lun')); // sets availability (default 08:00–18:00)
  fireEvent.press(screen.getByTestId('onboarding-license-oui'));
  fireEvent.press(screen.getByTestId('onboarding-next-2'));
}

function answerScreening() {
  fireEvent.press(screen.getByTestId('screening-reliability-finish'));
  fireEvent.press(screen.getByTestId('screening-honesty-return_now'));
  fireEvent.press(screen.getByTestId('screening-customer-calm'));
  fireEvent.press(screen.getByTestId('screening-resourceful-call_wait'));
  fireEvent.press(screen.getByTestId('screening-safety-safe'));
}

describe('ApplicationFormScreen', () => {
  it('walks the 3 steps: infos → livraison → personnalité', async () => {
    render(<ApplicationFormScreen />);
    expect(screen.getByTestId('onboarding-age')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-zones')).toBeNull();

    await completeStep1();
    await waitFor(() => expect(screen.getByTestId('onboarding-zones')).toBeTruthy());

    completeStep2();
    await waitFor(() => expect(screen.getByTestId('onboarding-screening')).toBeTruthy());
  });

  it('blocks step 1 until âge ≥ 18 (shows an inline error)', () => {
    render(<ApplicationFormScreen />);
    fireEvent.changeText(screen.getByTestId('onboarding-fullname'), 'Mamadou');
    fireEvent.changeText(screen.getByTestId('onboarding-age'), '16');
    fireEvent.changeText(screen.getByTestId('onboarding-city'), 'Conakry');
    fireEvent.press(screen.getByTestId('onboarding-vehicle-moto'));

    expect(screen.getByTestId('onboarding-age-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-next'));
    expect(screen.queryByTestId('onboarding-zones')).toBeNull(); // stayed on step 1
  });

  it('submits the full application once everything is answered', async () => {
    mockSubmit.mockResolvedValue({ ok: true, application: { id: 'a1' } });
    render(<ApplicationFormScreen />);
    await completeStep1();
    await waitFor(() => expect(screen.getByTestId('onboarding-zones')).toBeTruthy());
    completeStep2();
    await waitFor(() => expect(screen.getByTestId('onboarding-screening')).toBeTruthy());

    answerScreening();
    fireEvent.press(screen.getByTestId('onboarding-qr-oui'));
    // terms still unanswered → submit disabled (press is a no-op).
    fireEvent.press(screen.getByTestId('onboarding-submit'));
    expect(mockSubmit).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('onboarding-terms-oui'));
    fireEvent.press(screen.getByTestId('onboarding-submit'));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith({
      full_name: 'Mamadou Diallo',
      city: 'Conakry',
      vehicle_type: 'moto',
      id_photo_url: 'https://cdn.linky.gn/avatars/x.jpg',
      answers: {
        zones: 'Kaloum, Ratoma',
        availability: 'Lun · 08:00–18:00',
        availability_data: { days: ['lun'], start: '08:00', end: '18:00' },
        age: 28,
        screening: {
          reliability: 'finish',
          honesty: 'return_now',
          customer: 'calm',
          resourceful: 'call_wait',
          safety: 'safe',
        },
        has_license_insurance: true,
        accepts_qr_process: true,
        accepts_linky_terms: true,
      },
    });
    expect(useOnboardingStore.getState().appStatus).toBe('pending');
  });

  it('does not submit when the QR process is refused', async () => {
    render(<ApplicationFormScreen />);
    await completeStep1();
    await waitFor(() => expect(screen.getByTestId('onboarding-zones')).toBeTruthy());
    completeStep2();
    await waitFor(() => expect(screen.getByTestId('onboarding-screening')).toBeTruthy());

    answerScreening();
    fireEvent.press(screen.getByTestId('onboarding-qr-non'));
    fireEvent.press(screen.getByTestId('onboarding-terms-oui'));
    fireEvent.press(screen.getByTestId('onboarding-submit'));

    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
