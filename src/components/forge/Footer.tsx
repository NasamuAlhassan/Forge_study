import { Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/5 mt-12">
      <div className="mx-auto max-w-6xl px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-gradient-primary grid place-items-center">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-display text-base font-semibold">Forge</span>
          </div>
          <p className="mt-3 text-muted-foreground max-w-sm">
            The AI academic operating system for students. Plan less, study better.
          </p>
        </div>
        <div>
          <div className="text-foreground font-medium">Product</div>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li><a href="#features" className="hover:text-foreground">Features</a></li>
            <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
            <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
          </ul>
        </div>
        <div>
          <div className="text-foreground font-medium">Company</div>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li><a href="#" className="hover:text-foreground">About</a></li>
            <li><a href="#" className="hover:text-foreground">Careers</a></li>
            <li><a href="#" className="hover:text-foreground">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Forge Labs. All rights reserved.</span>
          <span>Made for students, with care.</span>
        </div>
      </div>
    </footer>
  );
}
