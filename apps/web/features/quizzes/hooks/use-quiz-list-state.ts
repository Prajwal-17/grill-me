"use client";

import { useState } from "react";

const STATUSES = ["all", "draft", "submitted", "new"] as const;
const DIFFICULTIES = ["all", "easy", "medium", "hard", "grill"] as const;
const SORTS = ["newest", "oldest", "name", "score"] as const;

type QuizListState = {
  search: string;
  status: (typeof STATUSES)[number];
  difficulty: (typeof DIFFICULTIES)[number];
  sort: (typeof SORTS)[number];
  page: number;
};

const defaults: QuizListState = {
  search: "",
  status: "all",
  difficulty: "all",
  sort: "newest",
  page: 1,
};

function readSettings(key: string): QuizListState {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!saved || saved.version !== 1) return defaults;
    return {
      search:
        typeof saved.search === "string" ? saved.search.slice(0, 200) : "",
      status: STATUSES.includes(saved.status) ? saved.status : "all",
      difficulty: DIFFICULTIES.includes(saved.difficulty)
        ? saved.difficulty
        : "all",
      sort: SORTS.includes(saved.sort) ? saved.sort : "newest",
      page: Number.isSafeInteger(saved.page) && saved.page > 0 ? saved.page : 1,
    };
  } catch {
    return defaults;
  }
}

export function useQuizListState(profileId: string) {
  const key = `grill-me.quiz-library.${process.env.NEXT_PUBLIC_APP_ENV ?? "development"}.${profileId}`;
  const [settings, setSettings] = useState(() => readSettings(key));

  function updateSettings(changes: Partial<QuizListState>) {
    const next = { ...settings, ...changes };
    setSettings(next);
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, ...next }));
    } catch {
      // Filtering still works when browser storage is unavailable.
    }
  }

  return [settings, updateSettings] as const;
}
