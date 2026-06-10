// Phase P.4 — deep-link landing for the Didit hosted flow (linky://kyc/return).
// openAuthSessionAsync usually intercepts the redirect and closes the browser
// itself, but on some Android browsers the link routes into the app instead —
// either way the user should land on the pending screen.
import { Redirect } from 'expo-router';

export default function KycReturnRoute() {
  return <Redirect href="/kyc/pending" />;
}
