import { env } from "@/shared/config/env";

import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

const STATUSES = ["all", "draft", "submitted", "new", "deleted"] as const;
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
  const key = `grill-me.quiz-library.${env.appEnv}.${profileId}`;
  const [stored] = useState(() => readSettings(key));
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { hash } = useLocation();
  // Keep collection state shareable without touching challenge id/tab parameters.
  const hasUrlState = [
    "quizSearch",
    "quizStatus",
    "quizDifficulty",
    "quizSort",
    "quizPage",
  ].some((key) => params.has(key));
  const settings: QuizListState = hasUrlState
    ? {
        search: (params.get("quizSearch") ?? "").slice(0, 200),
        status: STATUSES.includes(
          params.get("quizStatus") as QuizListState["status"],
        )
          ? (params.get("quizStatus") as QuizListState["status"])
          : defaults.status,
        difficulty: DIFFICULTIES.includes(
          params.get("quizDifficulty") as QuizListState["difficulty"],
        )
          ? (params.get("quizDifficulty") as QuizListState["difficulty"])
          : defaults.difficulty,
        sort: SORTS.includes(params.get("quizSort") as QuizListState["sort"])
          ? (params.get("quizSort") as QuizListState["sort"])
          : defaults.sort,
        page:
          Number.isSafeInteger(Number(params.get("quizPage"))) &&
          Number(params.get("quizPage")) > 0
            ? Number(params.get("quizPage"))
            : 1,
      }
    : stored;

  function updateSettings(changes: Partial<QuizListState>) {
    const next = { ...settings, ...changes };
    const updated = new URLSearchParams(params);
    updated.set("quizSearch", next.search);
    updated.set("quizStatus", next.status);
    updated.set("quizDifficulty", next.difficulty);
    updated.set("quizSort", next.sort);
    updated.set("quizPage", String(next.page));
    void navigate({ search: updated.toString(), hash }, { replace: true });
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, ...next }));
    } catch {
      // Filtering still works when browser storage is unavailable.
    }
  }

  return [settings, updateSettings] as const;
}
