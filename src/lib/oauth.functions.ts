import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authorizeAppUserOAuth } from "@/integrations/lovable/appUserConnector";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env['GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY'];
    if (!clientKey) {
      throw new Error(`GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY is not set`);
    }
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    // x-forwarded-host is proxy-sanitized only behind the sandbox's localhost
    // rewrite; elsewhere it is client-spoofable, so trust the request URL.
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/google/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: "google_mail",
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      credentialsConfiguration: {
        scopes: GMAIL_SCOPES,
      },
    });
    return { authorizationUrl };
  });
