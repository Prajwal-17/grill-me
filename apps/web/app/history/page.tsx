import { Suspense } from "react";
import { HistoryPage } from "../../features/history/pages/history-page";
import { LoadingScreen } from "../../shared/components/ui/feedback";
export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <HistoryPage />
    </Suspense>
  );
}
