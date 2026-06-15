import { useState } from "react";
import { Sparkles, BookOpen, Bookmark, BookmarkCheck, X, ChevronDown } from "lucide-react";
import { getTodayQuote } from "@/data/daily-quotes";
import { getTodayVerse } from "@/data/daily-verses";
import { useSavedItems, type SavedItem } from "@/hooks/use-saved-items";

const todayLabel = new Date().toLocaleDateString("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

// ─── Saved item pill ──────────────────────────────────────────────────────────
function SavedPill({ item, onRemove }: { item: SavedItem; onRemove: () => void }) {
  const isQuote = item.type === "quote";
  const accentColor = isQuote ? "oklch(0.72 0.17 58)" : "oklch(0.68 0.16 285)";
  const accentBg = isQuote
    ? "oklch(0.55 0.18 55 / 0.15)"
    : "oklch(0.50 0.17 285 / 0.15)";
  const accentBorder = isQuote
    ? "oklch(0.55 0.18 55 / 0.25)"
    : "oklch(0.50 0.17 285 / 0.25)";

  return (
    <div
      className="relative rounded-2xl p-4 group transition-all duration-200"
      style={{
        background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
        border: "1px solid color-mix(in oklch, var(--foreground) 8%, transparent)",
      }}
    >
      {/* type badge */}
      <span
        className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md mb-2.5"
        style={{
          background: accentBg,
          color: accentColor,
          border: `1px solid ${accentBorder}`,
          letterSpacing: "0.06em",
        }}
      >
        {isQuote ? "QUOTE" : "VERSE"}
      </span>

      {/* content */}
      <p
        className="text-[13px] leading-relaxed line-clamp-3"
        style={{ color: "var(--foreground)", opacity: 0.9 }}
      >
        {item.content}
      </p>

      {/* attribution */}
      {item.author && (
        <p className="text-[11px] text-muted-foreground mt-2 font-medium">
          — {item.author}
        </p>
      )}

      {/* remove button */}
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 h-6 w-6 rounded-lg grid place-items-center opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-white/[0.1] active:scale-[0.90]"
        aria-label="Remove from saved"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

// ─── Daily content card ────────────────────────────────────────────────────────
interface DailyContentCardProps {
  type: "quote" | "verse";
  content: string;
  attribution: string;
  explanation?: string;
  isSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
}

function DailyContentCard({
  type,
  content,
  attribution,
  explanation,
  isSaved,
  onSave,
  onUnsave,
}: DailyContentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isQuote = type === "quote";

  const accentColor = isQuote ? "oklch(0.72 0.17 58)" : "oklch(0.68 0.16 285)";
  const accentBg = isQuote
    ? "oklch(0.55 0.18 55 / 0.18)"
    : "oklch(0.50 0.17 285 / 0.18)";
  const accentBorder = isQuote
    ? "oklch(0.55 0.18 55 / 0.30)"
    : "oklch(0.50 0.17 285 / 0.30)";
  const glowGradient = isQuote
    ? "radial-gradient(ellipse 80% 50% at 100% 0%, oklch(0.55 0.18 55 / 0.10) 0%, transparent 60%)"
    : "radial-gradient(ellipse 80% 50% at 100% 0%, oklch(0.50 0.17 285 / 0.10) 0%, transparent 60%)";

  const Icon = isQuote ? Sparkles : BookOpen;
  const title = isQuote ? "Daily Motivation" : "Daily Verse";

  return (
    <div className="ring-gradient glass hover-lift rounded-2xl p-5 relative flex flex-col gap-4">
      {/* Specular highlight */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 35% at 25% 0%, oklch(1 0 0 / 0.055) 0%, transparent 60%)",
        }}
      />
      {/* Accent glow */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ background: glowGradient }}
      />

      {/* Header */}
      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-xl grid place-items-center shrink-0"
            style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: accentColor }} />
          </div>
          <div>
            <h2
              className="text-[14px] font-semibold"
              style={{ letterSpacing: "-0.02em" }}
            >
              {title}
            </h2>
            <p className="text-[11px] text-muted-foreground">{todayLabel}</p>
          </div>
        </div>

        <button
          onClick={isSaved ? onUnsave : onSave}
          className="h-8 w-8 rounded-xl grid place-items-center transition-all duration-200 hover:bg-white/[0.07] active:scale-[0.90]"
          aria-label={isSaved ? "Remove from saved" : "Save to favorites"}
          title={isSaved ? "Saved — click to remove" : "Save to favorites"}
        >
          {isSaved ? (
            <BookmarkCheck className="h-4 w-4" style={{ color: accentColor }} />
          ) : (
            <Bookmark className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="relative flex-1">
        {/* Decorative quotation mark */}
        <span
          className="absolute -top-3 -left-0.5 text-6xl leading-none select-none pointer-events-none"
          style={{
            color: `${accentColor.replace(")", " / 0.20)")}`,
            fontFamily: "Georgia, 'Times New Roman', serif",
            lineHeight: 1,
          }}
          aria-hidden
        >
          "
        </span>
        <p
          className="text-[14px] leading-relaxed pl-5 pt-1"
          style={{ color: "var(--foreground)", opacity: 0.88 }}
        >
          {content}
        </p>
        <p className="text-[12px] text-muted-foreground mt-3 pl-5 font-medium">
          — {attribution}
        </p>
      </div>

      {/* Explanation toggle */}
      {explanation && (
        <div
          className="relative rounded-xl overflow-hidden transition-all duration-300"
          style={{
            background: `color-mix(in oklch, ${accentColor} 6%, transparent)`,
            border: `1px solid ${accentBorder.replace("0.30)", "0.15)")}`,
          }}
        >
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
            aria-expanded={expanded}
          >
            <span className="text-[11px] font-semibold" style={{ color: accentColor }}>
              {isQuote ? "What does this mean?" : "What does this verse mean?"}
            </span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
              style={{
                color: accentColor,
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
          {expanded && (
            <p
              className="px-3.5 pb-3.5 text-[12px] leading-relaxed"
              style={{ color: "var(--foreground)", opacity: 0.78 }}
            >
              {explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Saved favorites section ──────────────────────────────────────────────────
function SavedSection({
  items,
  onRemove,
}: {
  items: SavedItem[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BookmarkCheck
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden
        />
        <h2
          className="text-[13px] font-semibold text-muted-foreground"
          style={{ letterSpacing: "-0.01em" }}
        >
          Saved favorites
        </h2>
        <span
          className="ml-auto text-[11px] text-muted-foreground/60 tabular-nums"
        >
          {items.length} saved
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((item) => (
          <SavedPill
            key={item.id}
            item={item}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DailyCards() {
  const { items, save, remove, isSaved, getSavedItem } = useSavedItems();

  const todayQuote = getTodayQuote();
  const todayVerse = getTodayVerse();

  const handleSaveQuote = () =>
    save({ type: "quote", content: todayQuote.text, author: todayQuote.author });

  const handleUnsaveQuote = () => {
    const saved = getSavedItem(todayQuote.text);
    if (saved) remove(saved.id);
  };

  const handleSaveVerse = () =>
    save({ type: "verse", content: todayVerse.text, author: todayVerse.reference });

  const handleUnsaveVerse = () => {
    const saved = getSavedItem(todayVerse.text);
    if (saved) remove(saved.id);
  };

  return (
    <div className="space-y-4">
      {/* Two cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DailyContentCard
          type="quote"
          content={todayQuote.text}
          attribution={todayQuote.author}
          explanation={todayQuote.explanation}
          isSaved={isSaved(todayQuote.text)}
          onSave={handleSaveQuote}
          onUnsave={handleUnsaveQuote}
        />
        <DailyContentCard
          type="verse"
          content={todayVerse.text}
          attribution={todayVerse.reference}
          explanation={todayVerse.explanation}
          isSaved={isSaved(todayVerse.text)}
          onSave={handleSaveVerse}
          onUnsave={handleUnsaveVerse}
        />
      </div>

      {/* Saved favorites */}
      <SavedSection items={items} onRemove={remove} />
    </div>
  );
}
