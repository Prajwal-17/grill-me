import { Suspense } from "react";
import { LogsPage } from "../../features/logs/pages/logs-page";
import { LoadingScreen } from "../../shared/components/ui/feedback";
export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LogsPage />
    </Suspense>
  );
}
