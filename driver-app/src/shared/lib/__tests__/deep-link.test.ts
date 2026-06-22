import {
  resolveDeepLinkPath,
  isAllowedExternalUrl,
  SAFE_FALLBACK_ROUTE,
} from '@/shared/lib/deep-link';

describe('resolveDeepLinkPath', () => {
  it('allows a known route', () => {
    expect(resolveDeepLinkPath('/')).toBe('/');
  });

  it('strips a custom scheme and host', () => {
    expect(resolveDeepLinkPath('skeleton:///')).toBe('/');
  });

  it('ignores query params and never trusts them for routing', () => {
    expect(resolveDeepLinkPath('/?next=https://evil.example/steal')).toBe('/');
  });

  it('sends unknown routes to the safe fallback', () => {
    expect(resolveDeepLinkPath('/admin/secret')).toBe(SAFE_FALLBACK_ROUTE);
  });

  it('degrades safely on null / empty / malformed input', () => {
    expect(resolveDeepLinkPath(null)).toBe(SAFE_FALLBACK_ROUTE);
    expect(resolveDeepLinkPath('')).toBe(SAFE_FALLBACK_ROUTE);
    expect(resolveDeepLinkPath('::::not a url::::')).toBe(SAFE_FALLBACK_ROUTE);
  });
});

describe('isAllowedExternalUrl', () => {
  const hosts = ['yourcompany.com'];

  it('allows https on an allowlisted host', () => {
    expect(isAllowedExternalUrl('https://yourcompany.com/help', hosts)).toBe(true);
  });

  it('rejects non-https schemes (no open redirect / injection)', () => {
    expect(isAllowedExternalUrl('http://yourcompany.com', hosts)).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)', hosts)).toBe(false);
  });

  it('rejects hosts that are not on the allowlist', () => {
    expect(isAllowedExternalUrl('https://evil.example', hosts)).toBe(false);
  });
});
