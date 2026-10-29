import { useParams } from "react-router";
import { LogDetailPage } from "@/features/logs/pages/log-detail-page";

export function Component() {
  const { id } = useParams();
  return <LogDetailPage key={id} id={id!} />;
}
