import { apiPost } from '@/shared/lib/api';

import { fetchProfile, saveProfile } from '../lib/profile-api';

jest.mock('@/shared/lib/api', () => ({ apiPost: jest.fn() }));
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

  it('save is stubbed (not wired) until the backend endpoint ships', async () => {
    const r = await saveProfile({ full_name: 'A', city: 'B', vehicle_type: 'moto' });
    expect(r.ok).toBe(false);
  });
});
