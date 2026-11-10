import { appUserReconnectRequired, callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";
import { GMAIL_SCOPES } from "@/lib/oauth.functions";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

export interface GmailHit {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export type GmailSearchResult =
  | { status: "ok"; hits: GmailHit[] }
  | { status: "not_connected" }
  | { status: "reconnect_required" }
  | { status: "error"; message: string };

function headerValue(headers: { name?: string; value?: string }[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

/** Search the signed-in user's Gmail. Server-only. */
export async function searchUserGmail(userId: string, query: string, maxResults = 6): Promise<GmailSearchResult> {
  const connectionAPIKey = await getConnectionKeyForUser(userId, CONNECTOR_ID);
  if (!connectionAPIKey) return { status: "not_connected" };

  const listRes = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: CONNECTOR_ID,
    path: `/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    requiredScopes: GMAIL_SCOPES,
  });
  if (await appUserReconnectRequired(listRes)) return { status: "reconnect_required" };
  if (!listRes.ok) {
    const body = await listRes.text();
    console.error(`Gmail list failed [${listRes.status}]: ${body}`);
    return { status: "error", message: `Gmail list failed: ${listRes.status}` };
  }
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = (list.messages ?? []).map((m) => m.id).slice(0, maxResults);
  if (ids.length === 0) return { status: "ok", hits: [] };

  const hits = await Promise.all(
    ids.map(async (id): Promise<GmailHit | null> => {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId: CONNECTOR_ID,
        path: `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        requiredScopes: GMAIL_SCOPES,
      });
      if (!res.ok) return null;
      const msg = (await res.json()) as {
        id: string;
        snippet?: string;
        payload?: { headers?: { name?: string; value?: string }[] };
      };
      return {
        id: msg.id,
        from: headerValue(msg.payload?.headers, "From"),
        subject: headerValue(msg.payload?.headers, "Subject"),
        date: headerValue(msg.payload?.headers, "Date"),
        snippet: msg.snippet ?? "",
      };
    }),
  );

  return { status: "ok", hits: hits.filter((h): h is GmailHit => h !== null) };
}
