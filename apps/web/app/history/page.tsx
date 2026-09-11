import { HistoryPage } from "../../features/history/pages/history-page";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const query = await searchParams;
  return (
    <HistoryPage initialId={Array.isArray(query.id) ? query.id[0] : query.id} />
  );
}
