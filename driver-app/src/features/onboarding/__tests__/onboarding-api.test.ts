import { ApiError, apiPost } from '@/shared/lib/api';

import { fetchApplicationStatus, submitApplication } from '../lib/onboarding-api';
import type { ApplicationInput } from '../model/schema';

jest.mock('@/shared/lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    message_fr: string;
    constructor(status: number, body: { code: string; message_fr: string }) {
      super(body.message_fr || body.code);
      this.name = 'ApiError';
      this.status = status;
      this.code = body.code;
      this.message_fr = body.message_fr;
    }
  }
  return { apiPost: jest.fn(), ApiError };
});

const mockApiPost = apiPost as jest.Mock;
const apiErr = (status: number, code: string, message_fr = '') =>
  new ApiError(status, { code, message_fr });

const validInput: ApplicationInput = {
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
};

beforeEach(() => mockApiPost.mockReset());

describe('fetchApplicationStatus', () => {
  it('returns the typed status (none/pending/approved/rejected) and reject reason', async () => {
    mockApiPost.mockResolvedValue({ status: 'rejected', reject_reason: 'Zone non couverte' });

    const result = await fetchApplicationStatus();

    expect(mockApiPost).toHaveBeenCalledWith({ path: '/livreur-application-status' });
    expect(result).toEqual({
      ok: true,
      status: 'rejected',
      rejectReason: 'Zone non couverte',
      application: null,
    });
  });

  it('maps a transport failure to offline', async () => {
    mockApiPost.mockRejectedValue(apiErr(0, 'NETWORK_ERROR', 'Connexion impossible'));

    expect(await fetchApplicationStatus()).toMatchObject({ ok: false, kind: 'offline' });
  });

  it('treats an unexpected payload as a generic error', async () => {
    mockApiPost.mockResolvedValue({ status: 'weird-not-a-status' });

    expect(await fetchApplicationStatus()).toMatchObject({ ok: false, kind: 'error' });
  });
});

describe('submitApplication', () => {
  it('posts the exact wire body and returns the created application', async () => {
    mockApiPost.mockResolvedValue({ application: { id: 'app1' } });

    const result = await submitApplication(validInput);

    expect(mockApiPost).toHaveBeenCalledWith({
      path: '/livreur-apply',
      body: {
        full_name: 'Mamadou Diallo',
        city: 'Conakry',
        vehicle_type: 'moto',
        answers: {
          zones: 'Kaloum, Ratoma',
          availability: 'Lun–Sam, 8h–18h',
          has_license_insurance: true,
          accepts_qr_process: true,
          accepts_linky_terms: true,
        },
      },
    });
    expect(result).toEqual({ ok: true, application: { id: 'app1' } });
  });

  // Regression: the backend's `valid()` rejects a null id_photo_url (it accepts the
  // field omitted or as a string) → a null sent the body to 400 INVALID_BODY. The
  // wire body must OMIT the key when no photo is attached, and forward it when present.
  it('omits id_photo_url when none, and forwards it when provided', async () => {
    mockApiPost.mockResolvedValue({ application: { id: 'app1' } });

    await submitApplication(validInput); // id_photo_url: null
    expect(mockApiPost.mock.calls[0][0].body).not.toHaveProperty('id_photo_url');

    mockApiPost.mockClear();
    await submitApplication({ ...validInput, id_photo_url: 'https://cdn.linky.gn/id/abc.jpg' });
    expect(mockApiPost.mock.calls[0][0].body.id_photo_url).toBe('https://cdn.linky.gn/id/abc.jpg');
  });

  it('maps APPLICATION_PENDING → pending_exists with the French message', async () => {
    mockApiPost.mockRejectedValue(apiErr(409, 'APPLICATION_PENDING', 'Candidature déjà en cours.'));

    expect(await submitApplication(validInput)).toEqual({
      ok: false,
      kind: 'pending_exists',
      message: 'Candidature déjà en cours.',
    });
  });

  it('maps ALREADY_LIVREUR → already_livreur', async () => {
    mockApiPost.mockRejectedValue(apiErr(409, 'ALREADY_LIVREUR', 'Déjà livreur.'));

    expect(await submitApplication(validInput)).toMatchObject({ kind: 'already_livreur' });
  });

  it('maps MUST_ACCEPT_TERMS and INVALID_BODY', async () => {
    mockApiPost.mockRejectedValue(apiErr(400, 'MUST_ACCEPT_TERMS', 'Accepte les conditions.'));
    expect(await submitApplication(validInput)).toMatchObject({ kind: 'must_accept' });

    mockApiPost.mockRejectedValue(apiErr(400, 'INVALID_BODY', 'Corps invalide.'));
    expect(await submitApplication(validInput)).toMatchObject({ kind: 'invalid' });
  });
});
