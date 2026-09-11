"use client";
import { ApprovalCard, type ApprovalCardProps } from "./approval-card";

// The exercise flow currently asks one optional clarification per request.
export function ClarificationCard(props: ApprovalCardProps) {
  return <ApprovalCard {...props} />;
}
