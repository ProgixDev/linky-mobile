import { Redirect } from 'expo-router';

// Landing route for the payment sheet's returnURL (linky://stripe-redirect).
// 3DS / bank-app flows deep-link back here ; the native sheet resumes on top
// and the checkout handler drives navigation afterwards. Without this route,
// expo-router showed its Unmatched Route screen behind the sheet.
export default function StripeRedirect() {
  return <Redirect href="/" />;
}
