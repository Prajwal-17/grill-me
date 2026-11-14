import { apiRequest } from "@/shared/lib/api-client";
import type {
  PracticeSubmission,
  ReviewJob,
  ConnectedProject,
  Challenge,
  SubmissionFile,
  ModelSelection,
} from "@/shared/types/api";
const post = (data: unknown) => ({
  method: "POST",
  body: JSON.stringify(data),
});
export const getSubmissions = (profile: string, challenge: string) =>
  apiRequest<PracticeSubmission[]>(
    `/challenges/${challenge}/submissions`,
    {},
    profile,
  );
export const getSubmissionFile = (
  profile: string,
  submission: string,
  path: string,
) =>
  apiRequest<SubmissionFile>(
    `/submissions/${submission}/files?path=${encodeURIComponent(path)}`,
    {},
    profile,
  );
export const getProjects = (profile: string) =>
  apiRequest<ConnectedProject[]>("/projects", {}, profile);
export type JudgeStatus = {
  providerManaged?: boolean;
  codex: {
    installed: boolean;
    authenticated: boolean;
    version: string | null;
    message: string;
  };
  omniroute: {
    configured: boolean;
    online: boolean;
    message: string;
  };
  omnirouteConfigured: boolean;
  verificationAvailable: boolean;
};
export const getJudgeStatus = (profile: string) =>
  apiRequest<JudgeStatus>("/judges/status", {}, profile);
export const connectProject = (profile: string, path: string) =>
  apiRequest<ConnectedProject>("/projects", post({ path }), profile);
export const submitAttempt = (
  profile: string,
  challenge: string,
  data: {
    content: string;
    uploadIds: string[];
    projectId: string | null;
    subdirectory: string;
    baseRevision: string;
    selection?: ModelSelection;
  },
) =>
  apiRequest<{ submission: PracticeSubmission; review: ReviewJob }>(
    `/challenges/${challenge}/submissions`,
    post(data),
    profile,
  );
export const retryReview = (
  profile: string,
  id: string,
  followup: string | null = null,
  selection?: ModelSelection,
) =>
  apiRequest<ReviewJob>(
    `/reviews/${id}/retry`,
    post({ followup, ...(selection ? { selection } : {}) }),
    profile,
  );
export const cancelReview = (profile: string, id: string) =>
  apiRequest<ReviewJob>(`/reviews/${id}/cancel`, post({}), profile);
export const setChallengeStatus = (
  profile: string,
  id: string,
  status: "active" | "paused" | "saved" | "stopped",
) =>
  apiRequest<Challenge>(`/challenges/${id}/status`, post({ status }), profile);
export async function uploadFile(
  profile: string,
  file: File,
  progress: (percent: number) => void,
  filename = file.name,
) {
  const upload = await apiRequest<{ id: string }>(
    "/uploads",
    post({ filename }),
    profile,
  );
  let offset = 0;
  do {
    const bytes = new Uint8Array(
      await file.slice(offset, offset + 256 * 1024).arrayBuffer(),
    );
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const next = offset + bytes.length;
    await apiRequest(
      `/uploads/${upload.id}/chunks`,
      post({ offset, data: btoa(binary), finish: next >= file.size }),
      profile,
    );
    offset = next;
    progress(file.size ? Math.round((offset / file.size) * 100) : 100);
  } while (offset < file.size);
  return { id: upload.id, filename };
}

export type FolderListing = {
  path: string;
  parent: string | null;
  folders: { name: string; path: string }[];
};
export const browseFolders = (profile: string, path = "") =>
  apiRequest<FolderListing>(
    "/projects/browse?path=" + encodeURIComponent(path),
    {},
    profile,
  );
