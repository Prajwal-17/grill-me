"use client";
import {
  ApprovalCard,
  type ApprovalCardProps,
} from "@/shared/components/ai/approval-card";

// The build flow asks one optional clarification per request.
export function ClarificationCard(props: ApprovalCardProps) {
  return <ApprovalCard {...props} />;
}
