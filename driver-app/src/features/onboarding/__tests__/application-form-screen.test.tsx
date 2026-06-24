import { fireEvent, render, screen, waitFor } from '@/shared/testing/render';

import { submitApplication } from '../lib/onboarding-api';
import { useOnboardingStore } from '../model/store';
import { ApplicationFormScreen } from '../ui/application-form-screen';

jest.mock('../lib/onboarding-api', () => ({
  submitApplication: jest.fn(),
  fetchApplicationStatus: jest.fn(),
}));

const mockSubmit = submitApplication as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useOnboardingStore.getState().reset();
  useOnboardingStore.setState({ phase: 'ready', appStatus: 'none' });
});

function completeStep1() {
  fireEvent.changeText(screen.getByTestId('onboarding-fullname'), 'Mamadou Diallo');
  fireEvent.changeText(screen.getByTestId('onboarding-city'), 'Conakry');
  fireEvent.press(screen.getByTestId('onboarding-vehicle-moto'));
  fireEvent.press(screen.getByTestId('onboarding-next'));
}

describe('ApplicationFormScreen', () => {
  it('advances from infos (step 1) to the questionnaire (step 2)', async () => {
    render(<ApplicationFormScreen />);
    expect(screen.getByTestId('onboarding-fullname')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-zones')).toBeNull();

    completeStep1();

    await waitFor(() => expect(screen.getByTestId('onboarding-zones')).toBeTruthy());
  });

  it('keeps submit disabled until both « acceptes-tu » are oui, then posts the application', async () => {
    mockSubmit.mockResolvedValue({ ok: true, application: { id: 'a1' } });
    render(<ApplicationFormScreen />);
    completeStep1();
    await waitFor(() => expect(screen.getByTestId('onboarding-zones')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('onboarding-zones'), 'Kaloum, Ratoma');
    fireEvent.changeText(screen.getByTestId('onboarding-availability'), 'Lun–Sam, 8h–18h');
    fireEvent.press(screen.getByTestId('onboarding-license-oui'));
    fireEvent.press(screen.getByTestId('onboarding-qr-oui'));
    // terms still unanswered → submit is disabled (press is a no-op).
    fireEvent.press(screen.getByTestId('onboarding-submit'));
    expect(mockSubmit).not.toHaveBeenCalled();

    // accept the terms → submit enabled.
    fireEvent.press(screen.getByTestId('onboarding-terms-oui'));
    fireEvent.press(screen.getByTestId('onboarding-submit'));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    expect(mockSubmit).toHaveBeenCalledWith({
      full_name: 'Mamadou Diallo',
      city: 'Conakry',
      vehicle_type: 'moto',
      id_photo_url: null,
      answers: {
        zones: 'Kaloum, Ratoma',
        availability: 'Lun–Sam, 8h–18h',
        has_license_insurance: true,
        accepts_qr_process: true,
        accepts_linky_terms: true,
      },
    });
    expect(useOnboardingStore.getState().appStatus).toBe('pending');
  });

  it('does not submit when the QR process is refused (accepts must be oui)', async () => {
    render(<ApplicationFormScreen />);
    completeStep1();
    await waitFor(() => expect(screen.getByTestId('onboarding-zones')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('onboarding-zones'), 'Kaloum');
    fireEvent.changeText(screen.getByTestId('onboarding-availability'), 'Lun–Sam');
    fireEvent.press(screen.getByTestId('onboarding-license-oui'));
    fireEvent.press(screen.getByTestId('onboarding-qr-non')); // refuses QR
    fireEvent.press(screen.getByTestId('onboarding-terms-oui'));

    fireEvent.press(screen.getByTestId('onboarding-submit'));

    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
