"use client";
import { ApprovalCard, type ApprovalCardProps } from "./approval-card";

// The build flow asks one optional clarification per request.
export function ClarificationCard(props: ApprovalCardProps) {
  return <ApprovalCard {...props} />;
}
