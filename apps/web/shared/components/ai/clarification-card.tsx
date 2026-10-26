"use client";
import {
  ApprovalCard,
  type ApprovalCardProps,
} from "@/shared/components/ai/approval-card";

// Essential clarification supports free text and ordered follow-up questions.
export function ClarificationCard(props: ApprovalCardProps) {
  return <ApprovalCard {...props} />;
}
