import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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
    if (!user) {
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
