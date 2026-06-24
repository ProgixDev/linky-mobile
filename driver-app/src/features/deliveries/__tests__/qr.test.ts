import { parseOrderQr } from '../lib/qr';

// The buyer's on-screen order QR (rendered by the Linky consumer app):
//   linky://order/<order_id>/confirm?token=<scan_token>
const ORDER = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';
const VALID = `linky://order/${ORDER}/confirm?token=${TOKEN}`;

describe('parseOrderQr', () => {
  it('parses a valid order QR into orderId + scanToken (AC-5)', () => {
    expect(parseOrderQr(VALID)).toEqual({ orderId: ORDER, scanToken: TOKEN });
  });

  it('trims surrounding whitespace', () => {
    expect(parseOrderQr(`  ${VALID}\n`)).toEqual({ orderId: ORDER, scanToken: TOKEN });
  });

  it('tolerates an optional trailing slash (matches the canonical brief regex)', () => {
    // The Linky consumer app may render `…/confirm?token=<uuid>/`; the brief's regex
    // ends `\/?$`, so a trailing slash must NOT reject a legitimate handoff QR (AC-5).
    expect(parseOrderQr(`${VALID}/`)).toEqual({ orderId: ORDER, scanToken: TOKEN });
  });

  it('rejects junk / non-URL text', () => {
    expect(parseOrderQr('hello world')).toBeNull();
    expect(parseOrderQr('')).toBeNull();
  });

  it('rejects another URL scheme', () => {
    expect(parseOrderQr(`https://order/${ORDER}/confirm?token=${TOKEN}`)).toBeNull();
    expect(parseOrderQr(`linkydriver://order/${ORDER}/confirm?token=${TOKEN}`)).toBeNull();
  });

  it('rejects the wrong path / action', () => {
    expect(parseOrderQr(`linky://order/${ORDER}/cancel?token=${TOKEN}`)).toBeNull();
    expect(parseOrderQr(`linky://shop/${ORDER}/confirm?token=${TOKEN}`)).toBeNull();
  });

  it('rejects a non-uuid order id', () => {
    expect(parseOrderQr(`linky://order/not-a-uuid/confirm?token=${TOKEN}`)).toBeNull();
  });

  it('rejects a non-uuid token', () => {
    expect(parseOrderQr(`linky://order/${ORDER}/confirm?token=nope`)).toBeNull();
  });

  it('rejects a missing token', () => {
    expect(parseOrderQr(`linky://order/${ORDER}/confirm`)).toBeNull();
    expect(parseOrderQr(`linky://order/${ORDER}/confirm?token=`)).toBeNull();
  });

  it('rejects trailing junk after the token', () => {
    expect(parseOrderQr(`${VALID}&evil=1`)).toBeNull();
  });

  it('rejects non-string input at the runtime trust boundary', () => {
    expect(parseOrderQr(null)).toBeNull();
    expect(parseOrderQr(42)).toBeNull();
    expect(parseOrderQr(undefined)).toBeNull();
  });
});
