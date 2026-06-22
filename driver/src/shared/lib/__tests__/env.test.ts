import { parseEnv } from '@/shared/lib/env';

describe('parseEnv', () => {
  it('applies safe defaults for local development', () => {
    const env = parseEnv({});
    expect(env.EXPO_PUBLIC_API_URL).toBe('https://api.example.com');
    expect(env.EXPO_PUBLIC_APP_ENV).toBe('development');
  });

  it('accepts a valid configuration', () => {
    const env = parseEnv({
      EXPO_PUBLIC_API_URL: 'https://api.yourcompany.com',
      EXPO_PUBLIC_APP_ENV: 'production',
    });
    expect(env.EXPO_PUBLIC_APP_ENV).toBe('production');
  });

  it('fails fast with a readable message on malformed values', () => {
    expect(() => parseEnv({ EXPO_PUBLIC_API_URL: 'not-a-url' })).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});
