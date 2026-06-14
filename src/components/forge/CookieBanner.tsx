import { useState, useEffect } from "react";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "forge-cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    const show = () => setVisible(true);
    window.addEventListener("forge:show-cookie-consent", show);
    return () => window.removeEventListener("forge:show-cookie-consent", show);
  }, []);

  if (!visible) return null;

  function accept() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, "declined");
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 glass rounded-2xl p-5 shadow-elegant border border-white/10 animate-slide-up"
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-primary grid place-items-center">
          <Cookie className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">We use cookies</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            We use essential cookies to make Forge work. With your consent, we also use analytics
            cookies to improve your experience.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="bg-gradient-primary hover:opacity-90 shadow-glow flex-1 h-10"
              onClick={accept}
            >
              Accept all
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="glass border-white/10 flex-1 h-10"
              onClick={decline}
            >
              Decline
            </Button>
          </div>
        </div>
        <button
          onClick={decline}
          aria-label="Dismiss cookie banner"
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
