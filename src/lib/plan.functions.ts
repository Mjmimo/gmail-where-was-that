import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const FREE_DAILY_SEARCHES = 5;
export const MODEL_SWITCH_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const MODELS = [
  { id: "google/gemini-3-flash-preview", label: "Gemini", vendor: "Google" },
  { id: "openai/gpt-6-astra", label: "ChatGPT", vendor: "OpenAI" },
  { id: "anthropic/claude-sonnet-5", label: "Claude", vendor: "Anthropic" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

const DEFAULT_MODEL: ModelId = "google/gemini-3-flash-preview";

export interface PlanState {
  plan: "free" | "paid";
  model: ModelId;
  searchesUsed: number;
  searchesLimit: number | null; // null = unlimited
  canSwitchModel: boolean;
  nextModelSwitchAt: string | null;
}

async function ensurePlanRow(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_plans")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: created, error: insertError } = await supabaseAdmin
    .from("user_plans")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created;
}

function toPlanState(row: {
  plan: string;
  model: string;
  model_changed_at: string;
  searches_used: number;
  searches_reset_at: string;
}): PlanState {
  const isPaid = row.plan === "paid";
  const resetAt = new Date(row.searches_reset_at).getTime();
  const used = Date.now() - resetAt > MODEL_SWITCH_COOLDOWN_MS ? 0 : row.searches_used;
  const nextSwitch = new Date(row.model_changed_at).getTime() + MODEL_SWITCH_COOLDOWN_MS;
  const canSwitch = isPaid || Date.now() >= nextSwitch;
  return {
    plan: isPaid ? "paid" : "free",
    model: (MODELS.some((m) => m.id === row.model) ? row.model : DEFAULT_MODEL) as ModelId,
    searchesUsed: used,
    searchesLimit: isPaid ? null : FREE_DAILY_SEARCHES,
    canSwitchModel: canSwitch,
    nextModelSwitchAt: canSwitch ? null : new Date(nextSwitch).toISOString(),
  };
}

export const getMyPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanState> => {
    const row = await ensurePlanRow(context.userId);
    return toPlanState(row);
  });

export const changeModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { model: string }) => input)
  .handler(async ({ data, context }): Promise<PlanState> => {
    if (!MODELS.some((m) => m.id === data.model)) {
      throw new Error("Modèle inconnu.");
    }
    const row = await ensurePlanRow(context.userId);
    const state = toPlanState(row);
    if (!state.canSwitchModel && state.model !== data.model) {
      throw new Error(
        `Tu peux changer de modèle une fois toutes les 24 h avec l'offre gratuite. Prochain changement possible : ${state.nextModelSwitchAt}`,
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("user_plans")
      .update({
        model: data.model,
        model_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw error;
    return toPlanState(updated);
  });

/** Consume one search for the user. Throws when the free quota is exhausted. */
export async function consumeSearchQuota(userId: string): Promise<PlanState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row = await ensurePlanRow(userId);
  const state = toPlanState(row);
  if (state.searchesLimit !== null && state.searchesUsed >= state.searchesLimit) {
    throw new Error(
      "Quota gratuit atteint : 5 recherches par jour. Passe à l'offre Premium (399,99 SAR/mois) pour des recherches illimitées.",
    );
  }
  const resetNeeded = Date.now() - new Date(row.searches_reset_at).getTime() > MODEL_SWITCH_COOLDOWN_MS;
  const { data: updated, error } = await supabaseAdmin
    .from("user_plans")
    .update({
      searches_used: (resetNeeded ? 0 : row.searches_used) + 1,
      searches_reset_at: resetNeeded ? new Date().toISOString() : row.searches_reset_at,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return toPlanState(updated);
}
