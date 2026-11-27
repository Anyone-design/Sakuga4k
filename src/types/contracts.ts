/**
 * Sakuga4K System Contracts & Data Entities
 * Contract matching contracts.json (v1.1.0)
 */

export type HealthState = "online" | "degraded" | "busy" | "offline";

export interface HealthStatus {
  status: HealthState;
  gpuModel: string;
  vramTotalMB: number;
  vramFreeMB: number;
  activePreset: string;
  driveMounted: boolean;
  engineVersion?: string;
}

export type ModelPreset = "animevideov3" | "animesharp" | "realcugan_pop" | "anime6b";
export type ClipStatus = "queued" | "uploading" | "processing" | "completed" | "failed" | "cancelled";
export type ProcessingStage =
  | "queued"
  | "extracting"
  | "probing"
  | "upscaling"
  | "reassembling"
  | "syncing"
  | "completed"
  | "failed"
  | "cancelled";

export interface VideoClip {
  id: string;
  name: string;
  sizeBytes: number;
  durationSeconds?: number;
  originalResolution: string;
  targetResolution: string;
  actualOutputResolution?: string;
  modelPreset: ModelPreset;
  status: ClipStatus;
  stage?: ProcessingStage;
  progressPercent: number;
  currentFrame: number;
  totalFrames: number;
  etaSeconds: number;
  activeBatchSize?: number;
  throughputFps?: number;
  vramUsedMB?: number;
  downloadUrl?: string;
  drivePath?: string;
  driveError?: string;
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
