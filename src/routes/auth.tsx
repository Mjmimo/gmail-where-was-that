import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — HelpAi" },
      { name: "description", content: "Connecte-toi à HelpAi avec ton compte Google." },
      { property: "og:title", content: "Connexion — HelpAi" },
      { property: "og:description", content: "Connecte-toi pour chercher dans ton Gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/app", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function signIn() {
    setLoading(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
    if (res && "error" in res && res.error) {
      toast.error("Connexion impossible. Réessaie.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 font-sans">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center">
        <h1 className="font-display text-3xl font-bold">HelpAi</h1>
        <p className="mt-2 text-muted-foreground">Connecte-toi pour commencer.</p>
        <Button className="mt-6 w-full" size="lg" onClick={signIn} disabled={loading}>
          {loading ? "Connexion…" : "Continuer avec Google"}
        </Button>
      </div>
    </div>
  );
}
