import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Mail, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HelpAi — Retrouve tout dans ton Gmail en le demandant" },
      { name: "description", content: "Pose une question, HelpAi fouille ton Gmail avec Claude, ChatGPT ou Gemini et te donne la réponse." },
      { property: "og:title", content: "HelpAi — Ton Gmail, en une question" },
      { property: "og:description", content: "Claude, ChatGPT et Gemini cherchent dans tes e-mails à ta place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-bold">HelpAi</span>
        <Button asChild variant="outline"><Link to="/auth">Se connecter</Link></Button>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 md:pt-24">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm">
          <Sparkles className="h-4 w-4" /> Claude · ChatGPT · Gemini
        </p>
        <h1 className="max-w-3xl font-display text-5xl font-bold leading-[1.05] md:text-7xl">
          « Où est la facture de mars ? » <span className="text-primary">Demande-le.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          HelpAi cherche dans ton propre Gmail et te répond en citant les e-mails trouvés. Plus besoin de fouiller.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Commencer gratuitement</Link></Button>
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-3">
          {[
            { icon: Mail, t: "Connecte ton Gmail", d: "En un clic, avec ton compte Google. Lecture seule." },
            { icon: Search, t: "Pose ta question", d: "Comme à un assistant : un nom, une date, un sujet." },
            { icon: Sparkles, t: "Reçois la réponse", d: "L'IA résume et te montre les e-mails sources." },
          ].map(({ icon: I, t, d }) => (
            <div key={t}>
              <I className="mb-3 h-6 w-6 text-primary" />
              <h3 className="font-display text-xl font-semibold">{t}</h3>
              <p className="mt-1 text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-4xl font-bold">Tarifs</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Plan name="Gratuit" price="0 SAR" items={["5 recherches par jour", "1 modèle IA au choix", "Changement de modèle 1 fois / 24 h"]} />
          <Plan highlight name="Premium" price="399,99 SAR / mois" items={["Recherches illimitées", "Claude, ChatGPT et Gemini", "Change de modèle quand tu veux"]} />
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">© HelpAi</footer>
    </div>
  );
}

function Plan({ name, price, items, highlight }: { name: string; price: string; items: string[]; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-8 ${highlight ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <h3 className="font-display text-2xl font-semibold">{name}</h3>
      <p className="mt-2 font-display text-4xl font-bold">{price}</p>
      <ul className="mt-6 space-y-2">
        {items.map((i) => (
          <li key={i} className="flex items-center gap-2"><Check className="h-4 w-4" /> {i}</li>
        ))}
      </ul>
      <Button asChild className="mt-8" variant={highlight ? "secondary" : "default"}>
        <Link to="/auth">{highlight ? "Choisir Premium" : "Essayer"}</Link>
      </Button>
    </div>
  );
}
