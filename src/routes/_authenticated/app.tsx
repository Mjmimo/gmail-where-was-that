import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, LogOut, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { startGmailConnect } from "@/lib/oauth.functions";
import { completeAppUserConnection, disconnectGmail, getGmailStatus } from "@/lib/appUserConnections.functions";
import { changeModel, getMyPlan, MODELS } from "@/lib/plan.functions";
import { askHelpAi, type AskResult } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Mon assistant — HelpAi" },
      { name: "description", content: "Pose tes questions sur ton Gmail." },
      { property: "og:title", content: "Mon assistant — HelpAi" },
      { property: "og:description", content: "Pose tes questions sur ton Gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppPage,
});

type Msg = { role: "user" | "assistant"; content: string; sources?: AskResult["sources"] };

function waitForOAuth(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    const cleanup = () => { window.removeEventListener("message", onMsg); clearInterval(poll); };
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "google_mail") return;
      if (t !== "appUserConnectorOAuthComplete" && t !== "appUserConnectorOAuthFailed") return;
      cleanup();
      if (t === "appUserConnectorOAuthComplete") resolve(typeof e.data.code === "string" ? e.data.code : null);
      else { popup.close(); reject(new Error("Connexion Gmail échouée.")); }
    };
    window.addEventListener("message", onMsg);
    const poll = window.setInterval(() => {
      if (popup.closed) { cleanup(); reject(new Error("Fenêtre fermée avant la fin.")); }
    }, 500);
  });
}

function AppPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const gmail = useQuery({ queryKey: ["gmail"], queryFn: () => getGmailStatus() });
  const plan = useQuery({ queryKey: ["plan"], queryFn: () => getMyPlan() });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) { toast.error("Autorise les fenêtres pop-up puis réessaie."); return; }
    try {
      const { authorizationUrl } = await startGmailConnect();
      const done = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await done;
      if (code) await completeAppUserConnection({ data: { code } });
      await qc.invalidateQueries({ queryKey: ["gmail"] });
      toast.success("Gmail connecté !");
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Erreur de connexion");
    }
  }

  async function disconnect() {
    await disconnectGmail();
    await qc.invalidateQueries({ queryKey: ["gmail"] });
    toast.success("Gmail déconnecté.");
  }

  async function pickModel(model: string) {
    try {
      const next = await changeModel({ data: { model } });
      qc.setQueryData(["plan"], next);
      toast.success("Modèle changé.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function ask() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await askHelpAi({ data: { question: q, history } });
      qc.setQueryData(["plan"], res.plan);
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources }]);
      if (res.gmail !== "ok") qc.invalidateQueries({ queryKey: ["gmail"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const p = plan.data;
  const g = gmail.data;

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-display text-xl font-bold">HelpAi</span>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {p && (
              <>
                <select
                  aria-label="Modèle IA"
                  className="rounded-md border bg-background px-2 py-1"
                  value={p.model}
                  onChange={(e) => pickModel(e.target.value)}
                >
                  {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <span className="rounded-full bg-secondary px-3 py-1">
                  {p.plan === "paid" ? "Premium" : `Gratuit · ${p.searchesUsed}/${p.searchesLimit}`}
                </span>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {gmail.isLoading ? "Vérification de Gmail…" :
              g?.connected ? <span>Gmail connecté : <b>{g.email}</b></span> :
              g?.reconnectRequired ? "Ton accès Gmail doit être renouvelé." :
              "Connecte ton Gmail pour que HelpAi puisse chercher."}
          </div>
          {g?.connected ? (
            <Button variant="outline" size="sm" onClick={disconnect}>Déconnecter</Button>
          ) : (
            <Button size="sm" onClick={connect}>{g?.reconnectRequired ? "Reconnecter Gmail" : "Connecter Gmail"}</Button>
          )}
        </div>

        {p?.plan === "free" && p.nextModelSwitchAt && (
          <p className="mb-4 text-sm text-muted-foreground">
            Prochain changement de modèle possible : {new Date(p.nextModelSwitchAt).toLocaleString("fr-FR")}. Premium (399,99 SAR/mois) : illimité.
          </p>
        )}

        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <p className="py-16 text-center font-display text-2xl text-muted-foreground">
              Que cherches-tu dans tes e-mails ?
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground" : "max-w-[90%] rounded-2xl border bg-card px-4 py-3"}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                  {m.sources.map((s) => <div key={s.id}>✉ {s.subject || "(sans objet)"} — {s.from}</div>)}
                </div>
              )}
            </div>
          ))}
          {busy && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </div>

        <form className="sticky bottom-0 mt-4 flex gap-2 bg-background py-3" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
            placeholder="Ex : Quand arrive mon colis Amazon ?"
            rows={2}
          />
          <Button type="submit" disabled={busy || !input.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></Button>
        </form>
      </main>
    </div>
  );
}
