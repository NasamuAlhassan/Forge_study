import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium focus:shadow-glow"
      >
        Skip to main content
      </a>
      <header className="fixed top-0 inset-x-0 z-50 px-4 pt-4">
        <div className="mx-auto max-w-6xl glass rounded-2xl px-4 sm:px-6 py-3 flex items-center justify-between shadow-elegant">
          <Link to="/" className="flex items-center gap-2 group" aria-label="Forge home">
            <div className="relative h-8 w-8 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">Forge</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground" aria-label="Main navigation">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex h-11" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button size="sm" className="bg-gradient-primary hover:opacity-90 shadow-glow h-11" asChild aria-label="Get started with Forge for free">
              <Link to="/login">Get started</Link>
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}
