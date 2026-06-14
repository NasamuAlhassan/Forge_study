import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEMO_MODE } from "@/lib/demo-data";

export interface SavedItem {
  id: string;
  type: "quote" | "verse";
  content: string;
  author: string | null;
  saved_at: string;
}

export function useSavedItems() {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEMO_MODE || !user) {
      setLoading(false);
      return;
    }
    supabase
      .from("saved_items")
      .select("*")
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false })
      .then(({ data }) => {
        setItems((data ?? []) as SavedItem[]);
        setLoading(false);
      });
  }, [user]);

  const save = useCallback(
    async (item: Omit<SavedItem, "id" | "saved_at">) => {
      if (DEMO_MODE) {
        // Optimistic local-only save so the bookmark icon updates in the demo
        const fakeItem: SavedItem = {
          id: `demo-${Date.now()}`,
          ...item,
          saved_at: new Date().toISOString(),
        };
        setItems((prev) => [fakeItem, ...prev]);
        return;
      }
      if (!user) return;
      const { data, error } = await supabase
        .from("saved_items")
        .insert({ ...item, user_id: user.id })
        .select()
        .single();
      if (!error && data) {
        setItems((prev) => [data as SavedItem, ...prev]);
      }
    },
    [user]
  );

  const remove = useCallback(async (id: string) => {
    if (DEMO_MODE) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      return;
    }
    await supabase.from("saved_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const isSaved = useCallback(
    (content: string) => items.some((i) => i.content === content),
    [items]
  );

  const getSavedItem = useCallback(
    (content: string) => items.find((i) => i.content === content) ?? null,
    [items]
  );

  return { items, loading, save, remove, isSaved, getSavedItem };
}
