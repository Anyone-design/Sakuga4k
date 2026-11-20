/**
 * Sakuga4K System Contracts & Data Entities
 * Frozen contract matching contracts.json (v1.0.0)
 */

export type HealthState = "online" | "degraded" | "busy" | "offline";

export interface HealthStatus {
  status: HealthState;
  gpuModel: string;
  vramTotalMB: number;
  vramFreeMB: number;
  activePreset: string;
  driveMounted: boolean;
}

export type ModelPreset = "animevideov3" | "animesharp" | "realcugan_pop" | "anime6b";
export type ClipStatus = "queued" | "uploading" | "processing" | "completed" | "failed";

export interface VideoClip {
  id: string;
  name: string;
  sizeBytes: number;
  durationSeconds?: number;
  originalResolution: string;
  targetResolution: string;
  modelPreset: ModelPreset;
  status: ClipStatus;
  progressPercent: number;
  currentFrame: number;
  totalFrames: number;
  etaSeconds: number;
  downloadUrl?: string;
  drivePath?: string;
  error?: string;
}

export interface BatchSummary {
  batchId: string;
  totalClips: number;
  completedClips: number;
  failedClips: number;
  zipDownloadUrl?: string;
}

export interface UploadResponse {
  clip: VideoClip;
  error?: string;
}

export interface ProgressStreamEvent {
  type: "progress" | "complete" | "error";
  clip: VideoClip;
}
