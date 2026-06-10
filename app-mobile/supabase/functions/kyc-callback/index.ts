// Phase P.3 — browser landing page after the Didit hosted flow (public GET).
//
// Didit redirects the in-app browser here when the user finishes (or
// abandons) verification. The page immediately deep-links back into the app
// — openAuthSessionAsync watches for the linky:// scheme and closes itself.
// The visible fallback copy covers browsers that block the redirect.
// Deploy with --no-verify-jwt (a browser redirect can't send an apikey).
//
// Dev caveat : the hardcoded linky:// scheme matches dev-client/production
// builds (app.json scheme). In Expo Go the return URL would be
// exp://<host>/--/kyc/return, so the browser won't auto-close there — test
// KYC in a dev build, not Expo Go.
const HTML = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Linky — Vérification</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0E1726; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { text-align: center; padding: 32px; }
    .check { font-size: 48px; }
    a { color: #1FA971; font-weight: 600; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✅</div>
    <h1>C'est envoyé !</h1>
    <p>Tu peux revenir à l'application Linky.<br>Ta vérification est en cours de traitement.</p>
    <p><a href="linky://kyc/return">Revenir à l'app</a></p>
  </div>
  <script>location.href = 'linky://kyc/return';</script>
</body>
</html>`;

Deno.serve((req: Request): Response => {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  return new Response(HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
});
