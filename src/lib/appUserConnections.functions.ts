import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appUserReconnectRequired,
  callAsAppUser,
  disconnectAppUser,
  exchangeAppUserOAuthCode,
} from "@/integrations/lovable/appUserConnector";
import {
  deleteConnectionKeyForUser,
  getConnectionKeyForUser,
  saveConnectionKeyForUser,
} from "@/lib/appUserConnections.server";
import { GMAIL_SCOPES } from "@/lib/oauth.functions";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

export const completeAppUserConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data, context }) => {
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== CONNECTOR_ID) {
      throw new Error("OAuth completion returned the wrong connector");
    }
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!connectionAPIKey) return { connected: false as const, reconnectRequired: false, email: null };
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/profile",
      requiredScopes: GMAIL_SCOPES,
    });
    if (await appUserReconnectRequired(res)) {
      return { connected: false as const, reconnectRequired: true, email: null };
    }
    if (!res.ok) {
      const body = await res.text();
      console.error(`Gmail profile lookup failed [${res.status}]: ${body}`);
      throw new Error(`Gmail profile lookup failed: ${res.status}`);
    }
    const profile = (await res.json()) as { emailAddress?: string };
    return { connected: true as const, reconnectRequired: false, email: profile.emailAddress ?? null };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (connectionAPIKey) {
      await disconnectAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId: CONNECTOR_ID,
      });
      await deleteConnectionKeyForUser(context.userId, CONNECTOR_ID);
    }
    return { ok: true };
  });
