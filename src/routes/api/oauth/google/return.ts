// Server endpoint that returns plain HTML — not a React component.
// The popup has no session in the editor preview, so it cannot load a
// session-protected app route. This endpoint requires no authentication and
// returns lightweight HTML that posts the result to the opener.
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/oauth/google/return')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const connectorId = url.searchParams.get("connector_id") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const success = url.searchParams.get("success") === "true";
        const offlineAccessAllowed = url.searchParams.get("offline_access_allowed");
        const error = url.searchParams.get("error");

        const result = success && offlineAccessAllowed === "false"
          ? { success: true, connectorId, code: null }
          : success && code
          ? { success: true, connectorId, code }
          : { success: false, connectorId, error: error ?? (success ? "Missing code" : "OAuth failed") };

        const escapeHtml = (str: string) =>
          str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const safeJson = JSON.stringify(result).replace(/<\//g, '<\\/');

        const html = `<!DOCTYPE html>
<html>
<head><title>Connexion en cours…</title></head>
<body>
  <p>${result.success ? "Connexion terminée, fermeture…" : "Échec : " + escapeHtml(result.error ?? "Erreur inconnue")}</p>
  <script>
    const result = ${safeJson};
    const type = result.success ? "appUserConnectorOAuthComplete" : "appUserConnectorOAuthFailed";
    const message = {
      type,
      connectorId: result.connectorId,
      code: result.code ?? null
    };

    if (window.opener && window.opener !== window) {
      window.opener.postMessage(message, window.location.origin);
    }
    window.close();
  </script>
</body>
</html>`;

        return new Response(html, {
          headers: { "Content-Type": "text/html" }
        });
      },
    },
  },
});
