import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchUserGmail, type GmailHit } from "@/lib/gmail.server";
import { consumeSearchQuota, MODELS, type PlanState } from "@/lib/plan.functions";

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskResult {
  answer: string;
  sources: GmailHit[];
  gmail: "ok" | "not_connected" | "reconnect_required" | "error";
  plan: PlanState;
}

function buildPrompt(question: string, hits: GmailHit[]): string {
  if (hits.length === 0) {
    return `Question de l'utilisateur : ${question}\n\nAucun e-mail correspondant n'a été trouvé dans sa boîte Gmail. Dis-le clairement et propose des idées de recherche (autres mots-clés, nom d'expéditeur, période).`;
  }
  const context = hits
    .map(
      (h, i) =>
        `E-mail ${i + 1}:\nDe : ${h.from}\nObjet : ${h.subject}\nDate : ${h.date}\nExtrait : ${h.snippet}`,
    )
    .join("\n\n");
  return `Question de l'utilisateur : ${question}\n\nVoici les e-mails trouvés dans sa boîte Gmail :\n\n${context}\n\nRéponds à la question en t'appuyant sur ces e-mails. Cite les e-mails concernés (expéditeur, objet, date).`;
}

const SYSTEM_PROMPT = `Tu es HelpAi, un assistant qui aide les gens à retrouver des informations dans leurs e-mails Gmail. Tu réponds en français, de façon claire et concise. Tu ne inventes jamais d'information : si les e-mails fournis ne suffisent pas, tu le dis.`;

async function callModel(model: string, messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not set");

  if (model.startsWith("anthropic/")) {
    const res = await fetch(`${AI_GATEWAY_URL}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: false,
        system: SYSTEM_PROMPT,
        messages: messages.filter((m) => m.role !== "system"),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`AI gateway failed [${res.status}]: ${body}`);
      throw new Error(`Le modèle IA a renvoyé une erreur (${res.status}).`);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }

  const isAstra = model === "openai/gpt-6-astra";
  const res = await fetch(`${AI_GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      ...(isAstra ? { reasoning_effort: "low", max_completion_tokens: 4096 } : { max_tokens: 4096 }),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`AI gateway failed [${res.status}]: ${body}`);
    throw new Error(`Le modèle IA a renvoyé une erreur (${res.status}).`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export const askHelpAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { question: string; history?: ChatMessage[] }) => input)
  .handler(async ({ data, context }): Promise<AskResult> => {
    const question = data.question.trim();
    if (!question) throw new Error("Question vide.");

    // Quota first: throws when the free daily quota is exhausted.
    const plan = await consumeSearchQuota(context.userId);

    const gmail = await searchUserGmail(context.userId, question);
    const hits = gmail.status === "ok" ? gmail.hits : [];

    const history = (data.history ?? []).slice(-6);
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: buildPrompt(question, hits) },
    ];

    const answer = await callModel(plan.model, messages);

    return {
      answer,
      sources: hits,
      gmail: gmail.status === "ok" ? "ok" : gmail.status,
      plan,
    };
  });

export { MODELS };
