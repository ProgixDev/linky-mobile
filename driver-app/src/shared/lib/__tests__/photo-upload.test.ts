import { apiPost } from '@/shared/lib/api';
import { uploadAvatar } from '@/shared/lib/photo-upload';
import { uploadAsync } from 'expo-file-system/legacy';
import { manipulateAsync } from 'expo-image-manipulator';

jest.mock('@/shared/lib/api', () => ({ apiPost: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  uploadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 'binary' },
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

const mockApi = apiPost as jest.Mock;
const mockUpload = uploadAsync as jest.Mock;
const mockManip = manipulateAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockManip.mockResolvedValue({ uri: 'file://small.jpg' });
});

describe('uploadAvatar', () => {
  it('compresses, gets a signed URL, uploads, and returns the public URL', async () => {
    mockApi.mockResolvedValue({
      upload_url: 'https://up',
      public_url: 'https://pub/x.jpg',
      content_type: 'image/jpeg',
    });
    mockUpload.mockResolvedValue({ status: 200 });

    const r = await uploadAvatar('file://orig.jpg');

    expect(r).toEqual({ ok: true, url: 'https://pub/x.jpg' });
    expect(mockApi).toHaveBeenCalledWith({
      path: '/photo-upload-url',
      body: { kind: 'avatar', filename: 'photo.jpg', content_type: 'image/jpeg' },
    });
    expect(mockUpload).toHaveBeenCalledWith(
      'https://up',
      'file://small.jpg',
      expect.objectContaining({ httpMethod: 'PUT' }),
    );
  });

  it('fails gracefully on a non-2xx upload', async () => {
    mockApi.mockResolvedValue({ upload_url: 'https://up', public_url: 'https://pub/x.jpg' });
    mockUpload.mockResolvedValue({ status: 403 });

    expect((await uploadAvatar('file://orig.jpg')).ok).toBe(false);
  });

  it('fails gracefully when the signed-URL request throws', async () => {
    mockApi.mockRejectedValue(new Error('network'));

    expect((await uploadAvatar('file://orig.jpg')).ok).toBe(false);
  });
});
