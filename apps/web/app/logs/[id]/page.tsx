import { Suspense } from "react";
import { LogDetailPage } from "../../../features/logs/pages/log-detail-page";
import { LoadingScreen } from "../../../shared/components/ui/feedback";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LogDetailPage id={id} />
    </Suspense>
  );
}
