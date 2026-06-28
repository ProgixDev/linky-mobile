import { ApiError, apiPost } from '@/shared/lib/api';

import { fetchProfile, saveProfile } from '../lib/profile-api';

// Real ApiError class so the lib's `instanceof ApiError` mapping works in tests.
jest.mock('@/shared/lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    message_fr: string;
    constructor(status: number, body: { code: string; message_fr: string }) {
      super(body.message_fr);
      this.status = status;
      this.code = body.code;
      this.message_fr = body.message_fr;
    }
  }
  return { apiPost: jest.fn(), ApiError };
});
const mockPost = apiPost as jest.Mock;

beforeEach(() => mockPost.mockReset());

describe('profile-api', () => {
  it('maps the application snapshot to the profile view', async () => {
    mockPost.mockResolvedValue({
      status: 'approved',
      application: {
        full_name: 'Chouaib',
        city: 'Conakry',
        vehicle_type: 'voiture',
        id_photo_url: null,
      },
    });

    const r = await fetchProfile();

    expect(r).toEqual({
      ok: true,
      view: {
        fullName: 'Chouaib',
        city: 'Conakry',
        vehicleType: 'voiture',
        idPhotoUrl: null,
        approved: true,
      },
    });
  });

  it('degrades gracefully on an unexpected response shape', async () => {
    mockPost.mockResolvedValue({ unexpected: true });
    const r = await fetchProfile();
    expect(r.ok).toBe(false);
  });

  it('drops an unknown vehicle_type to null rather than failing', async () => {
    mockPost.mockResolvedValue({ status: 'pending', application: { vehicle_type: 'spaceship' } });
    const r = await fetchProfile();
    expect(r).toMatchObject({ ok: true, view: { vehicleType: null, approved: false } });
  });

  it('saves the edit via update-livreur-profile', async () => {
    mockPost.mockResolvedValue({ ok: true });

    const r = await saveProfile({ full_name: 'A', city: 'B', vehicle_type: 'moto' });

    expect(mockPost).toHaveBeenCalledWith({
      path: '/update-livreur-profile',
      body: { full_name: 'A', city: 'B', vehicle_type: 'moto' },
    });
    expect(r.ok).toBe(true);
  });

  it('surfaces the server message when the save fails', async () => {
    mockPost.mockRejectedValue(
      new ApiError(500, { code: 'INTERNAL_ERROR', message_fr: 'Erreur.' }),
    );

    const r = await saveProfile({ full_name: 'A', city: 'B', vehicle_type: 'moto' });

    expect(r).toEqual({ ok: false, message: 'Erreur.' });
  });
});
