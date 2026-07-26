import { Dimensions } from 'react-native';

// Responsive cap (client 2026-07-26). The UI is designed for a phone width
// (~375-430px). On a big screen — a large tablet or an unfolded foldable — the
// fixed-pixel layout stretches and the spacing looks blown out. We keep the app
// in a centered phone-width column instead. This is a NO-OP on any real phone
// (width <= APP_MAX_WIDTH): only screens wider than this get constrained.
export const APP_MAX_WIDTH = 500;

// The width the content actually occupies — window width, capped. Use this
// instead of Dimensions.get('window').width anywhere a full-bleed element must
// match the centered content column (carousels, feed cards, etc.).
export function contentWidth(): number {
  return Math.min(Dimensions.get('window').width, APP_MAX_WIDTH);
}
