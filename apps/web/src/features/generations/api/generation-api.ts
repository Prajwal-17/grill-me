import { apiRequest } from "@/shared/lib/api-client";
import type { GenerationJob, GenerationRequest } from "../types";
export const generationKeys = {
  list: (profileId?: string) => ["generation-jobs", profileId] as const,
  detail: (profileId: string, id: string) =>
    ["generation-job", profileId, id] as const,
};
export const getGenerationJobs = (profileId: string, signal?: AbortSignal) =>
  apiRequest<GenerationJob[]>("/generation-jobs", { signal }, profileId);
export const getGenerationJob = (profileId: string, id: string) =>
  apiRequest<GenerationJob>(`/generation-jobs/${id}`, {}, profileId);
export const enqueueGeneration = (
  profileId: string,
  request: GenerationRequest,
) =>
  apiRequest<GenerationJob>(
    "/generation-jobs",
    { method: "POST", body: JSON.stringify(request) },
    profileId,
  );
export const acknowledgeGeneration = (profileId: string, job: GenerationJob) =>
  apiRequest<{ acknowledged: boolean }>(
    `/generation-jobs/${job.id}/acknowledge`,
    {
      method: "POST",
      body: JSON.stringify({ status: job.status, updatedAt: job.updatedAt }),
    },
    profileId,
  );
export const answerGeneration = (
  profileId: string,
  id: string,
  question: string,
  answer: string,
) =>
  apiRequest<GenerationJob>(
    `/generation-jobs/${id}/answer`,
    { method: "POST", body: JSON.stringify({ question, answer }) },
    profileId,
  );
export const retryGeneration = (
  profileId: string,
  id: string,
  skipPreparation = false,
) =>
  apiRequest<GenerationJob>(
    `/generation-jobs/${id}/retry`,
    { method: "POST", body: JSON.stringify({ skipPreparation }) },
    profileId,
  );
export const cancelGeneration = (profileId: string, id: string) =>
  apiRequest<GenerationJob>(
    `/generation-jobs/${id}/cancel`,
    { method: "POST", body: "{}" },
    profileId,
  );
