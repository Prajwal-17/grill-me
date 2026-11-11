import { createBrowserRouter } from "react-router";
import { GenerationMonitor } from "@/features/generations/components/generation-monitor";
import { LoadingScreen } from "@/shared/components/ui/feedback";
import { NotFoundPage, RouteErrorPage } from "./routes/route-error";

export const router = createBrowserRouter([
  {
    Component: GenerationMonitor,
    ErrorBoundary: RouteErrorPage,
    HydrateFallback: LoadingScreen,
    children: [
      {
        path: "settings",
        lazy: async () => ({
          Component: (await import("@/features/settings/settings-page"))
            .SettingsPage,
        }),
      },
      {
        index: true,
        lazy: async () => ({
          Component: (
            await import("@/features/chat/pages/generation-home-page")
          ).GenerationHomePage,
        }),
      },
      { path: "chat", lazy: () => import("./routes/chat-route") },
      {
        path: "challenges",
        lazy: async () => ({
          Component: (
            await import("@/features/challenges/pages/challenges-page")
          ).ChallengesPage,
        }),
      },
      {
        path: "quizzes",
        lazy: async () => ({
          Component: (await import("@/features/quizzes/pages/quizzes-page"))
            .QuizzesPage,
        }),
      },
      {
        path: "history",
        lazy: async () => ({
          Component: (await import("@/features/history/pages/history-page"))
            .HistoryPage,
        }),
      },
      {
        path: "preferences",
        lazy: async () => ({
          Component: (await import("@/features/profile/pages/preferences-page"))
            .PreferencesPage,
        }),
      },
      {
        path: "logs",
        lazy: async () => ({
          Component: (await import("@/features/logs/pages/logs-page")).LogsPage,
        }),
      },
      { path: "logs/:id", lazy: () => import("./routes/log-detail-route") },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);
