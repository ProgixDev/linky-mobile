import * as Application from 'expo-application';
import * as StoreReview from 'expo-store-review';

import { appStorage } from '@/shared/lib/storage';
import { logger } from '@/shared/lib/logger';

const COUNT_KEY = 'lifecycle.positive-events';
const ASKED_VERSION_KEY = 'lifecycle.review-asked-version';
const THRESHOLD = 3;

/**
 * Ask for an App Store / Play review at a GOOD moment — after the user does
 * something positive, never on launch. Call it on positive events; it only
 * actually prompts once we've seen `THRESHOLD` of them AND we haven't already
 * asked for this app version (the OS also rate-limits the dialog).
 */
export async function maybeAskForReview(): Promise<void> {
  try {
    if (!(await StoreReview.isAvailableAsync())) return;

    const version = Application.nativeApplicationVersion ?? '0';
    const askedVersion = await appStorage.get(ASKED_VERSION_KEY);
    if (askedVersion === version) return; // already asked this version

    const count = Number((await appStorage.get(COUNT_KEY)) ?? '0') + 1;
    await appStorage.set(COUNT_KEY, String(count));
    if (count < THRESHOLD) return;

    await StoreReview.requestReview();
    await appStorage.set(ASKED_VERSION_KEY, version);
    await appStorage.set(COUNT_KEY, '0');
  } catch (err) {
    logger.warn('lifecycle: review prompt failed', { err });
  }
}
