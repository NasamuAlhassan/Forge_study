import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, User, Paintbrush } from "lucide-react";
import { Topbar } from "@/components/dashboard/Topbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSchedule } from "@/hooks/use-schedule";
import type { Difficulty } from "@/lib/demo-data";
import { broadcastScheduleUpdate } from "@/hooks/use-schedule";
import { useGlassIntensity } from "@/hooks/use-glass-intensity";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

const PALETTE = [
  "from-indigo-500 to-purple-500",
  "from-blue-500 to-cyan-500",
  "from-fuchsia-500 to-pink-500",
  "from-violet-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-red-500",
];

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  very_hard: "Very Hard",
};

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-orange-400",
  very_hard: "text-rose-400",
};

interface SubjectRow {
  id: string;
  name: string;
  code: string;
  instructor: string;
  difficulty: Difficulty;
  color: string;
  isNew?: boolean;
}

// ── Difficulty localStorage fallback ─────────────────────────────────────────
// The Supabase generated types don't include `difficulty` so the DB save is
// done with `as any`. If the column is missing or the save is rejected, we
// keep the value in localStorage so it survives page reloads.
function diffKey(userId: string) {
  return `forge-difficulties:${userId}`;
}
function loadDiffs(userId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(diffKey(userId)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function saveDiffs(userId: string, map: Record<string, string>): void {
  try {
    localStorage.setItem(diffKey(userId), JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

function SettingsPage() {
  const { user } = useAuth();
  const { refetch } = useSchedule();
  const { intensity, update: updateIntensity } = useGlassIntensity();

  // ── Profile ─────────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(
    () => (user?.user_metadata?.full_name as string | undefined) ?? "",
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Sync when auth loads after initial render
  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setDisplayName(user.user_metadata.full_name as string);
    }
  }, [user?.user_metadata?.full_name]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName.trim() },
      });
      if (error) throw error;
      toast.success("Display name updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update name");
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Subjects ─────────────────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [savingSubjects, setSavingSubjects] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoadingSubjects(true);
    supabase
      .from("subjects")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const saved = loadDiffs(user.id);
        setSubjects(
          (data ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            code: s.code ?? "",
            instructor: s.instructor ?? "",
            // DB value wins if present; otherwise fall back to localStorage, then "medium"
            difficulty:
              (((s as Record<string, unknown>).difficulty as Difficulty) || null) ??
              (saved[s.id] as Difficulty | undefined) ??
              "medium",
            color: s.color,
          })),
        );
        setLoadingSubjects(false);
      });
  }, [user]);

  const updateSubject = (id: string, field: keyof SubjectRow, value: string) => {
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const addSubject = () => {
    const tempId = `new_${Date.now()}`;
    setSubjects((prev) => [
      ...prev,
      {
        id: tempId,
        name: "",
        code: "",
        instructor: "",
        difficulty: "medium",
        color: PALETTE[prev.length % PALETTE.length],
        isNew: true,
      },
    ]);
  };

  const errMsg = (e: unknown) =>
    (e as { message?: string })?.message ?? (e == null ? "Unknown error" : String(e));

  const removeSubject = async (id: string, isNew?: boolean) => {
    if (isNew) {
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    try {
      // Delete subject's events first, then the subject
      await supabase.from("events").delete().eq("subject_id", id);
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      await refetch();
      toast.success("Subject removed");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const saveSubjects = async () => {
    if (!user) return;
    setSavingSubjects(true);
    try {
      for (const s of subjects) {
        // Core fields — always supported
        const core = {
          name: s.name.trim(),
          code: s.code.trim() || null,
          instructor: s.instructor.trim() || null,
          color: s.color,
        };

        let savedId = s.isNew ? null : s.id;

        if (s.isNew) {
          const { data, error } = await supabase
            .from("subjects")
            .insert({ user_id: user.id, ...core })
            .select("id")
            .single();
          if (error) throw error;
          savedId = data.id;
        } else {
          const { error } = await supabase.from("subjects").update(core).eq("id", s.id);
          if (error) throw error;
        }

        // Difficulty — also attempt DB save (column may not be in the generated types)
        if (savedId) {
          await supabase
            .from("subjects")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ difficulty: s.difficulty } as any)
            .eq("id", savedId)
            .then(() => {
              /* silently continue — localStorage is the reliable fallback */
            });
        }
      }

      // Persist difficulties to localStorage so they survive regardless of DB column state
      const diffMap = Object.fromEntries(subjects.map((s) => [s.id, s.difficulty]));
      saveDiffs(user.id, diffMap);

      // Refresh local state with real IDs, merging localStorage difficulties
      const { data } = await supabase.from("subjects").select("*").eq("user_id", user.id);
      const saved = loadDiffs(user.id);
      setSubjects(
        (data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code ?? "",
          instructor: s.instructor ?? "",
          difficulty:
            (((s as Record<string, unknown>).difficulty as Difficulty) || null) ??
            (saved[s.id] as Difficulty | undefined) ??
            "medium",
          color: s.color,
        })),
      );
      broadcastScheduleUpdate();
      toast.success("Subjects saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSavingSubjects(false);
    }
  };

  const inputStyle = {
    background: "color-mix(in oklch, var(--foreground) 5%, transparent)",
    border: "1px solid color-mix(in oklch, var(--foreground) 10%, transparent)",
    boxShadow: "0 1px 0 oklch(1 0 0 / 0.08) inset",
  };

  return (
    <>
      <Topbar title="Settings" subtitle="Manage your profile and subjects." />
      <main className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">

        {/* ── Appearance ──────────────────────────────────────────────────── */}
        <section className="ring-gradient glass rounded-2xl p-6 space-y-5 relative overflow-hidden">
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 35% at 20% 0%, rgba(107,71,255,0.06) 0%, transparent 60%)",
            }}
          />
          <div className="flex items-center gap-3 relative">
            <div
              className="h-8 w-8 rounded-xl grid place-items-center shrink-0"
              style={{
                background: "var(--glass-bg-btn-dark)",
                border:     "1px solid var(--glass-border-dark)",
              }}
            >
              <Paintbrush className="h-[14px] w-[14px] text-white/70" />
            </div>
            <h3 className="text-[14px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
              Appearance
            </h3>
          </div>

          {/* Glass Style slider */}
          <div className="space-y-3 relative">
            <div className="flex items-center justify-between">
              <Label className="text-[13px] font-medium">Glass Style</Label>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                style={{
                  background: "var(--glass-bg-btn-dark)",
                  border:     "1px solid var(--glass-border-dark)",
                  color:      "rgba(255,255,255,0.80)",
                }}
              >
                {intensity}
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={intensity}
              onChange={(e) => updateIntensity(Number(e.target.value))}
              className="glass-intensity-slider"
              aria-label="Glass intensity — 0 is frost, 100 is liquid"
            />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground select-none">
              <span>❄️ Frost</span>
              <span>💧 Glass</span>
            </div>

            {/* Live preview card */}
            <div
              className="glass-panel rounded-xl p-4 mt-1 flex items-center justify-between"
              aria-label="Glass style preview"
            >
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Preview</p>
                <p
                  className="font-display font-bold"
                  style={{ fontSize: 22, letterSpacing: "-0.03em", lineHeight: 1 }}
                >
                  72.1h
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 opacity-70">
                  Study hours this week
                </p>
              </div>
              <div
                className="h-8 w-8 rounded-xl grid place-items-center"
                style={{
                  background: "var(--glass-bg-btn-dark)",
                  border:     "1px solid var(--glass-border-dark)",
                }}
              >
                <Paintbrush className="h-3.5 w-3.5 text-white/60" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Profile ─────────────────────────────────────────────────────── */}
        <section className="ring-gradient glass rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 35% at 20% 0%, oklch(1 0 0 / 0.055) 0%, transparent 60%)",
            }}
          />
          <div className="flex items-center gap-3 relative">
            <div
              className="h-8 w-8 rounded-xl grid place-items-center shrink-0"
              style={{
                background: "var(--glass-bg-btn-dark)",
                border:     "1px solid var(--glass-border-dark)",
              }}
            >
              <User className="h-[14px] w-[14px] text-white/70" />
            </div>
            <h3 className="text-[14px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
              Profile
            </h3>
          </div>

          <div className="space-y-1.5 relative">
            <Label className="text-[11px] text-muted-foreground">Display name</Label>
            <div className="flex gap-2">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="border-0 text-[13px]"
                style={inputStyle}
                onKeyDown={(e) => e.key === "Enter" && saveProfile()}
              />
              <button onClick={saveProfile} disabled={savingProfile || !displayName.trim()} className="btn-primary h-9 px-4 rounded-xl text-[12px] shrink-0">
                <Save className="h-3.5 w-3.5 relative z-10" />
                <span className="relative z-10">Save</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5 relative">
            <Label className="text-[11px] text-muted-foreground">Email</Label>
            <Input
              value={user?.email ?? ""}
              disabled
              className="border-0 text-[13px] opacity-45 cursor-not-allowed"
              style={inputStyle}
            />
          </div>
        </section>

        {/* ── Subjects ────────────────────────────────────────────────────── */}
        <section className="ring-gradient glass rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 35% at 80% 0%, oklch(1 0 0 / 0.045) 0%, transparent 60%)",
            }}
          />
          <div className="flex items-center justify-between relative">
            <h3 className="text-[14px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
              Subjects
            </h3>
            <button
              onClick={addSubject}
              className="h-8 px-3 rounded-xl flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.07] active:scale-[0.97] transition-all duration-150"
              style={{
                border: "1px solid color-mix(in oklch, var(--foreground) 9%, transparent)",
                background: "color-mix(in oklch, var(--foreground) 4%, transparent)",
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add subject
            </button>
          </div>

          {loadingSubjects ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl animate-pulse"
                  style={{ background: "color-mix(in oklch, var(--foreground) 4%, transparent)" }}
                />
              ))}
            </div>
          ) : subjects.length === 0 ? (
            <div
              className="text-[13px] text-muted-foreground/60 py-10 text-center rounded-xl relative"
              style={{
                border: "1px dashed color-mix(in oklch, var(--foreground) 9%, transparent)",
              }}
            >
              No subjects yet. Import a timetable or add one manually.
            </div>
          ) : (
            <div className="space-y-3 relative">
              {subjects.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl p-4 space-y-3"
                  style={{
                    background: "color-mix(in oklch, var(--foreground) 3%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--foreground) 7%, transparent)",
                    boxShadow: "0 1px 0 oklch(1 0 0 / 0.06) inset",
                  }}
                >
                  {/* Color swatch indicator */}
                  <div className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full bg-gradient-to-br ${s.color} shrink-0`} />
                    <span
                      className="text-[11px] text-muted-foreground/60 font-medium uppercase tracking-wider"
                      style={{ letterSpacing: "0.06em" }}
                    >
                      {s.isNew ? "New subject" : "Subject"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Name</Label>
                      <Input
                        value={s.name}
                        onChange={(e) => updateSubject(s.id, "name", e.target.value)}
                        placeholder="Subject name"
                        className="border-0 h-8 text-[13px]"
                        style={inputStyle}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Code</Label>
                      <Input
                        value={s.code}
                        onChange={(e) => updateSubject(s.id, "code", e.target.value)}
                        placeholder="e.g. MTH 201"
                        className="border-0 h-8 text-[13px]"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Lecturer</Label>
                      <Input
                        value={s.instructor}
                        onChange={(e) => updateSubject(s.id, "instructor", e.target.value)}
                        placeholder="Dr. Smith"
                        className="border-0 h-8 text-[13px]"
                        style={inputStyle}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">
                        Difficulty
                        {s.difficulty && (
                          <span className={`ml-2 ${DIFFICULTY_COLORS[s.difficulty]}`}>
                            ● {DIFFICULTY_LABELS[s.difficulty]}
                          </span>
                        )}
                      </Label>
                      <Select
                        value={s.difficulty}
                        onValueChange={(v) => updateSubject(s.id, "difficulty", v)}
                      >
                        <SelectTrigger className="border-0 h-8 text-[13px]" style={inputStyle}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                          <SelectItem value="very_hard">Very Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => removeSubject(s.id, s.isNew)}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-all duration-150 hover:bg-rose-500/10 active:scale-[0.97]"
                      style={{ color: "oklch(0.65 0.24 25)" }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingSubjects && subjects.length > 0 && (
            <button
              onClick={saveSubjects}
              disabled={savingSubjects}
              className="btn-primary btn-primary-full h-10 rounded-xl text-[13px]"
            >
              <Save className="h-4 w-4 relative z-10" />
              <span className="relative z-10">{savingSubjects ? "Saving…" : "Save subjects"}</span>
            </button>
          )}
        </section>
      </main>
    </>
  );
}
