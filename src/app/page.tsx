"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Download, FolderArchive, RefreshCw, CheckCircle2, Film, HardDrive } from "lucide-react";
import { Dropzone } from "@/components/Dropzone";
import { QueueList } from "@/components/QueueList";
import { PresetSelector } from "@/components/PresetSelector";
import { ProgressVisualizer } from "@/components/ProgressVisualizer";
import { ModelGuideModal } from "@/components/ModelGuideModal";
import type { VideoClip, ModelPreset } from "@/types/contracts";

const STORAGE_KEY = "sakuga4k_tunnel_url";

interface BackendTelemetryPayload extends Partial<VideoClip> {
  id?: string;
}

function formatResolutionLabel(res: "2k" | "4k"): string {
  return res === "2k" ? "2K • Auto Aspect" : "4K • Auto Aspect";
}

function getNormalizedTunnelUrl(): string {
  try {
    return (localStorage.getItem(STORAGE_KEY) || "").trim().replace(/\/+$/, "");
  } catch (err: unknown) {
    console.warn("[Sakuga4K] Failed to read tunnel URL:", err);
    return "";
  }
}

export default function StudioPage() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<ModelPreset>("animevideov3");
  const [selectedResolution, setSelectedResolution] = useState<"2k" | "4k">("2k");
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [flowState, setFlowState] = useState<"drop" | "progress" | "complete">("drop");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Store raw browser File objects, monotonic session guard, abort controller, and active SSE handles
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const sessionIdRef = useRef<number>(0);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const activeEventSourceRef = useRef<EventSource | null>(null);
  const activeSseSettleRef = useRef<(() => void) | null>(null);
  const activeBackendJobIdRef = useRef<string | null>(null);

  const abortActiveSessionHandles = useCallback(() => {
    sessionIdRef.current += 1;
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort();
      fetchAbortControllerRef.current = null;
    }
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
      activeEventSourceRef.current = null;
    }
    if (activeSseSettleRef.current) {
      const settle = activeSseSettleRef.current;
      activeSseSettleRef.current = null;
      settle();
    }
    activeBackendJobIdRef.current = null;
  }, []);

  // Listen for global open-model-guide events (from Header or shortcuts)
  useEffect(() => {
    const handleOpen = () => setIsGuideOpen(true);
    window.addEventListener("open-model-guide", handleOpen);
    return () => window.removeEventListener("open-model-guide", handleOpen);
  }, []);

  // Cancel any in-flight fetches, EventSource streams, or pending promises on unmount
  useEffect(() => {
    return () => {
      abortActiveSessionHandles();
    };
  }, [abortActiveSessionHandles]);

  const handleFilesAdded = useCallback(
    (files: File[]) => {
      setErrorMessage(null);
      const resLabel = formatResolutionLabel(selectedResolution);
      const newClips: VideoClip[] = files.map((file) => {
        const id = crypto.randomUUID();
        fileMapRef.current.set(id, file);
        return {
          id,
          name: file.name,
          sizeBytes: file.size,
          originalResolution: "Auto",
          targetResolution: resLabel,
          modelPreset: selectedPreset,
          status: "queued",
          stage: "queued",
          progressPercent: 0,
          currentFrame: 0,
          totalFrames: 120,
          etaSeconds: 15,
        };
      });

      setClips((prev) => [...prev, ...newClips]);
      if (!activeClipId && newClips.length > 0) {
        setActiveClipId(newClips[0].id);
      }
    },
    [activeClipId, selectedPreset, selectedResolution]
  );

  const handleSelectPreset = useCallback((preset: ModelPreset) => {
    setSelectedPreset(preset);
    setClips((prev) =>
      prev.map((c) => (c.status === "queued" ? { ...c, modelPreset: preset } : c))
    );
  }, []);

  const handleSelectResolution = useCallback((res: "2k" | "4k") => {
    setSelectedResolution(res);
    const resLabel = formatResolutionLabel(res);
    setClips((prev) =>
      prev.map((c) =>
        c.status === "queued"
          ? { ...c, targetResolution: resLabel, actualOutputResolution: undefined }
          : c
      )
    );
  }, []);

  const handleRemoveClip = useCallback((id: string) => {
    fileMapRef.current.delete(id);
    setClips((prev) => prev.filter((c) => c.id !== id));
    setActiveClipId((curr) => (curr === id ? null : curr));
  }, []);

  const handleClearQueue = useCallback(() => {
    abortActiveSessionHandles();
    fileMapRef.current.clear();
    setClips([]);
    setActiveClipId(null);
    setErrorMessage(null);
    setFlowState("drop");
  }, [abortActiveSessionHandles]);

  // Multi-Clip Turbo Pipeline execution via Cloudflare Tunnel
  const handleStartUpscale = async () => {
    if (clips.length === 0) return;
    setErrorMessage(null);

    const tunnelUrl = getNormalizedTunnelUrl();
    if (!tunnelUrl) {
      setErrorMessage(
        "Colab GPU is not connected. Please click 'Connect Colab' in the top header, paste your Cloudflare tunnel link, and then start upscaling."
      );
      return;
    }

    const queuedClips = clips.filter((c) => c.status === "queued" || c.status === "processing");
    if (queuedClips.length === 0) return;

    // Monotonic session token prevents stale aborted runs from mutating a newer session
    const currentSessionId = sessionIdRef.current + 1;
    sessionIdRef.current = currentSessionId;
    setFlowState("progress");

    for (const clip of queuedClips) {
      if (sessionIdRef.current !== currentSessionId) return;

      setActiveClipId(clip.id);
      const rawFile = fileMapRef.current.get(clip.id);

      if (!rawFile) {
        setClips((prev) =>
          prev.map((c) =>
            c.id === clip.id
              ? { ...c, status: "failed", stage: "failed", error: "File handle expired. Please re-drop the clip." }
              : c
          )
        );
        continue;
      }

      setClips((prev) =>
        prev.map((c) =>
          c.id === clip.id ? { ...c, status: "uploading", stage: "extracting", progressPercent: 1 } : c
        )
      );

      const uploadController = new AbortController();
      fetchAbortControllerRef.current = uploadController;

      try {
        const formData = new FormData();
        formData.append("file", rawFile);
        formData.append("preset", clip.modelPreset);
        formData.append("resolution", selectedResolution);

        const uploadRes = await fetch(`${tunnelUrl}/api/upload`, {
          method: "POST",
          body: formData,
          signal: uploadController.signal,
        });

        if (sessionIdRef.current !== currentSessionId) return;
        if (!uploadRes.ok) {
          throw new Error(`Upload rejected by Colab with HTTP ${uploadRes.status}`);
        }

        const jobData = (await uploadRes.json()) as BackendTelemetryPayload;
        if (sessionIdRef.current !== currentSessionId) {
          if (jobData.id) {
            fetch(`${tunnelUrl}/api/cancel/${jobData.id}`, {
              method: "POST",
              signal: AbortSignal.timeout(3000),
            }).catch((err: unknown) => {
              console.warn("[Sakuga4K] Deferred cancel notification error:", err);
            });
          }
          return;
        }

        const backendJobId = jobData.id;
        if (!backendJobId) {
          throw new Error("Colab backend omitted job identifier");
        }
        activeBackendJobIdRef.current = backendJobId;

        // Apply real probed metadata & target dimensions immediately
        setClips((prev) =>
          prev.map((c) =>
            c.id === clip.id
              ? {
                  ...c,
                  status: "processing",
                  originalResolution: jobData.originalResolution ?? c.originalResolution,
                  targetResolution: jobData.targetResolution ?? c.targetResolution,
                  actualOutputResolution: jobData.actualOutputResolution ?? c.actualOutputResolution,
                  totalFrames: jobData.totalFrames ?? c.totalFrames,
                  etaSeconds: jobData.etaSeconds ?? c.etaSeconds,
                }
              : c
          )
        );

        // Stream real-time inference telemetry via SSE
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const settleOnce = (err?: Error) => {
            if (settled) return;
            settled = true;
            activeSseSettleRef.current = null;
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          };
          activeSseSettleRef.current = () => settleOnce();

          const es = new EventSource(`${tunnelUrl}/api/progress/${backendJobId}`);
          activeEventSourceRef.current = es;

          es.addEventListener("progress", (event) => {
            if (sessionIdRef.current !== currentSessionId) {
              es.close();
              settleOnce();
              return;
            }
            try {
              const progressData = JSON.parse(event.data) as BackendTelemetryPayload;
              const isDone = progressData.status === "completed";
              const isFailed = progressData.status === "failed";
              const isCancelled = progressData.status === "cancelled";

              setClips((prev) =>
                prev.map((c) =>
                  c.id === clip.id
                    ? {
                        ...c,
                        status: isDone
                          ? "completed"
                          : isFailed
                          ? "failed"
                          : isCancelled
                          ? "queued"
                          : "processing",
                        stage: isCancelled ? "queued" : (progressData.stage ?? c.stage),
                        progressPercent: isCancelled ? 0 : (progressData.progressPercent ?? c.progressPercent),
                        currentFrame: isCancelled ? 0 : (progressData.currentFrame ?? c.currentFrame),
                        totalFrames: progressData.totalFrames ?? c.totalFrames,
                        etaSeconds: progressData.etaSeconds ?? c.etaSeconds,
                        activeBatchSize: isCancelled ? undefined : (progressData.activeBatchSize ?? c.activeBatchSize),
                        throughputFps: isCancelled ? undefined : (progressData.throughputFps ?? c.throughputFps),
                        vramUsedMB: isCancelled ? undefined : (progressData.vramUsedMB ?? c.vramUsedMB),
                        originalResolution: progressData.originalResolution ?? c.originalResolution,
                        actualOutputResolution: isCancelled
                          ? undefined
                          : (progressData.actualOutputResolution ?? c.actualOutputResolution),
                        targetResolution: isCancelled
                          ? formatResolutionLabel(selectedResolution)
                          : (progressData.actualOutputResolution ?? c.targetResolution),
                        downloadUrl: isDone ? `${tunnelUrl}/api/download/${backendJobId}` : undefined,
                        drivePath: isCancelled ? undefined : progressData.drivePath,
                        driveError: isCancelled ? undefined : progressData.driveError,
                        error: isCancelled ? undefined : progressData.error,
                      }
                    : c
                )
              );

              if (isDone || isCancelled) {
                es.close();
                if (activeEventSourceRef.current === es) {
                  activeEventSourceRef.current = null;
                }
                settleOnce();
              } else if (isFailed) {
                es.close();
                if (activeEventSourceRef.current === es) {
                  activeEventSourceRef.current = null;
                }
                settleOnce(new Error(progressData.error || "Inference failed on Colab"));
              }
            } catch (parseErr: unknown) {
              console.error("[Sakuga4K] Telemetry parse error:", parseErr);
            }
          });

          es.onerror = () => {
            es.close();
            if (activeEventSourceRef.current === es) {
              activeEventSourceRef.current = null;
            }
            if (sessionIdRef.current !== currentSessionId) {
              settleOnce();
              return;
            }

            const statusController = new AbortController();
            fetchAbortControllerRef.current = statusController;
            const timeoutTimer = setTimeout(() => statusController.abort(), 5000);

            fetch(`${tunnelUrl}/api/status/${backendJobId}`, {
              signal: statusController.signal,
            })
              .then(async (res) => {
                clearTimeout(timeoutTimer);
                if (!res.ok) {
                  throw new Error(`Status probe failed with HTTP ${res.status}`);
                }
                return (await res.json()) as BackendTelemetryPayload;
              })
              .then((statusPayload) => {
                if (sessionIdRef.current !== currentSessionId) {
                  settleOnce();
                  return;
                }
                if (statusPayload.status === "completed") {
                  setClips((prev) =>
                    prev.map((c) =>
                      c.id === clip.id
                        ? {
                            ...c,
                            status: "completed",
                            stage: "completed",
                            progressPercent: 100,
                            actualOutputResolution:
                              statusPayload.actualOutputResolution ?? c.actualOutputResolution,
                            targetResolution: statusPayload.actualOutputResolution ?? c.targetResolution,
                            throughputFps: statusPayload.throughputFps ?? c.throughputFps,
                            downloadUrl: `${tunnelUrl}/api/download/${backendJobId}`,
                            drivePath: statusPayload.drivePath,
                            driveError: statusPayload.driveError,
                          }
                        : c
                    )
                  );
                  settleOnce();
                } else if (statusPayload.status === "cancelled") {
                  settleOnce();
                } else if (statusPayload.status === "failed") {
                  settleOnce(new Error(statusPayload.error || "Inference failed on Colab"));
                } else {
                  settleOnce(new Error("Connection to Colab tunnel lost during inference"));
                }
              })
              .catch((statusErr: unknown) => {
                clearTimeout(timeoutTimer);
                if (sessionIdRef.current !== currentSessionId) {
                  settleOnce();
                  return;
                }
                const detail = statusErr instanceof Error ? statusErr.message : "Lost connection to Colab tunnel";
                settleOnce(new Error(detail));
              });
          };
        });
      } catch (err: unknown) {
        if (sessionIdRef.current !== currentSessionId) return;
        const msg = err instanceof Error ? err.message : "Processing failed";
        setClips((prev) =>
          prev.map((c) => (c.id === clip.id ? { ...c, status: "failed", stage: "failed", error: msg } : c))
        );
        setErrorMessage(`Processing error for ${clip.name}: ${msg}`);
      } finally {
        if (sessionIdRef.current === currentSessionId) {
          fetchAbortControllerRef.current = null;
          activeBackendJobIdRef.current = null;
        }
      }
    }

    if (sessionIdRef.current === currentSessionId) {
      setFlowState("complete");
    }
  };

  const handleCancelSession = () => {
    const backendJobId = activeBackendJobIdRef.current;
    abortActiveSessionHandles();

    const tunnelUrl = getNormalizedTunnelUrl();
    if (backendJobId && tunnelUrl) {
      fetch(`${tunnelUrl}/api/cancel/${backendJobId}`, {
        method: "POST",
        signal: AbortSignal.timeout(3000),
      }).catch((err: unknown) => {
        console.warn("[Sakuga4K] Backend cancel request failed:", err);
      });
    }

    const resLabel = formatResolutionLabel(selectedResolution);
    setClips((prev) =>
      prev.map((c) =>
        c.status === "processing" || c.status === "uploading"
          ? {
              ...c,
              status: "queued",
              stage: "queued",
              progressPercent: 0,
              currentFrame: 0,
              targetResolution: resLabel,
              actualOutputResolution: undefined,
              activeBatchSize: undefined,
              throughputFps: undefined,
              vramUsedMB: undefined,
              drivePath: undefined,
              driveError: undefined,
              error: undefined,
            }
          : c
      )
    );
    setFlowState("drop");
  };

  const activeClip = clips.find((c) => c.id === activeClipId) || clips[0];
  const activeIndex = clips.findIndex((c) => c.id === activeClipId);
  const completedClips = clips.filter((c) => c.status === "completed");
  const hasAnyCompleted = completedClips.length > 0;
  const anyDriveSynced = completedClips.some((c) => Boolean(c.drivePath));
  const anyDriveError = completedClips.some((c) => Boolean(c.driveError));

  return (
    <main className="flex-1 max-w-4xl w-full min-w-0 mx-auto px-4 sm:px-6 py-6 sm:py-12 flex flex-col justify-between">
      {/* Hero Headline */}
      <div className="space-y-2 text-center pb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          {flowState === "drop" && "Upscale anime."}
          {flowState === "progress" && `Synthesizing ${selectedResolution.toUpperCase()} Turbo.`}
          {flowState === "complete" && (hasAnyCompleted ? "Footage ready." : "Upscale unsuccessful.")}
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 font-normal">
          {flowState === "drop" && "Auto-batched FP16 neural reconstruction with zero paywalls."}
          {flowState === "progress" && "Auto-tuned PyTorch FP16 inference & CUDA resizing on Colab GPU."}
          {flowState === "complete" &&
            (hasAnyCompleted
              ? "CRF 16 • Medium Pop line crispness • Universal mobile & desktop ready."
              : "Review the clip errors below and retry after confirming Colab GPU health.")}
        </p>
      </div>

      {/* Main Interactive Stage Frame */}
      <div className="my-auto space-y-6">
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-medium"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{errorMessage}</span>
          </motion.div>
        )}

        {flowState === "drop" && (
          <motion.div
            key="stage-drop"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-6"
          >
            <Dropzone onFilesAdded={handleFilesAdded} />

            {/* Target Resolution Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border border-white/[0.08] bg-[#0c0d12]">
              <div className="space-y-0.5 min-w-0">
                <span className="text-xs font-bold text-white tracking-tight">Export Resolution</span>
                <p className="text-[11px] text-zinc-400">2K plays smoothly on all mobile devices; 4K is desktop UHD.</p>
              </div>
              <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 rounded-lg bg-black/40 border border-white/5 shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleSelectResolution("2k")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold tracking-tight text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-all cursor-pointer ${
                    selectedResolution === "2k"
                      ? "bg-white text-black shadow-md"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  2K • Mobile (1440p)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectResolution("4k")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold tracking-tight text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-all cursor-pointer ${
                    selectedResolution === "4k"
                      ? "bg-white text-black shadow-md"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  4K • Desktop (2160p)
                </button>
              </div>
            </div>

            <PresetSelector
              selected={selectedPreset}
              onSelect={handleSelectPreset}
              onOpenGuide={() => setIsGuideOpen(true)}
            />

            {clips.length > 0 && (
              <div className="space-y-4 pt-2">
                <QueueList
                  clips={clips}
                  onRemoveClip={handleRemoveClip}
                  onClearQueue={handleClearQueue}
                />

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  onClick={handleStartUpscale}
                  className="w-full py-3.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold tracking-tight shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-all cursor-pointer"
                >
                  Start Upscale ({clips.length} {clips.length === 1 ? "Clip" : "Clips"} • {selectedResolution.toUpperCase()})
                </motion.button>
              </div>
            )}
          </motion.div>
        )}

        {flowState === "progress" && (
          <motion.div
            key="stage-progress"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-6"
          >
            <ProgressVisualizer
              clip={activeClip || clips[0] || {
                id: "active",
                name: "Processing Footage...",
                sizeBytes: 0,
                originalResolution: "Auto",
                targetResolution: formatResolutionLabel(selectedResolution),
                modelPreset: selectedPreset,
                status: "processing",
                stage: "queued",
                progressPercent: 1,
                currentFrame: 0,
                totalFrames: 120,
                etaSeconds: 10,
              }}
              batchIndex={Math.max(0, activeIndex)}
              totalBatchClips={Math.max(1, clips.length)}
              onCancel={handleCancelSession}
            />

            <QueueList
              clips={clips}
              onRemoveClip={handleRemoveClip}
              onClearQueue={handleClearQueue}
              onSelectClip={setActiveClipId}
              selectedClipId={activeClipId || undefined}
              isProcessing={true}
            />
          </motion.div>
        )}

        {flowState === "complete" && (
          <motion.div
            key="stage-complete"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* Batch Status Card */}
            <div
              className={`relative w-full rounded-2xl p-6 sm:p-8 border shadow-2xl backdrop-blur-xl ${
                hasAnyCompleted
                  ? "border-emerald-500/20 bg-[#070d0a]/90"
                  : "border-red-500/25 bg-[#12080a]/90"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  {hasAnyCompleted ? (
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Neural Upscale Complete</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Batch Failed</span>
                    </div>
                  )}

                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                    {hasAnyCompleted
                      ? `${completedClips.length} ${completedClips.length === 1 ? "Clip" : "Clips"} Ready in ${selectedResolution.toUpperCase()}`
                      : "0 Clips Completed"}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {hasAnyCompleted
                      ? "CRF 16 • Medium Pop line clarity • Aspect ratio preserved • Mobile playback shield"
                      : "No output files were produced. Reset and verify your Colab tunnel connection before retrying."}
                  </p>

                  {anyDriveSynced && (
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 pt-1">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>
                        Synced to Google Drive: <code className="text-zinc-200">My Drive &gt; Sakuga4K_Upscaled</code>
                      </span>
                    </div>
                  )}
                  {anyDriveError && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-300 pt-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Google Drive auto-sync skipped or failed for one or more clips; direct downloads below remain available.</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap sm:flex-col items-stretch gap-2.5 shrink-0">
                  {hasAnyCompleted && (
                    <a
                      href={`${getNormalizedTunnelUrl()}/api/download-zip`}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold tracking-tight shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-all cursor-pointer"
                    >
                      <FolderArchive className="w-4 h-4" />
                      <span>Download All (ZIP)</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      fileMapRef.current.clear();
                      setClips([]);
                      setActiveClipId(null);
                      setErrorMessage(null);
                      setFlowState("drop");
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-zinc-300 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Upscale New Batch</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Individual Processed Clips Cards */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold tracking-tight text-zinc-400 uppercase">
                {hasAnyCompleted && completedClips.length === clips.length
                  ? `Completed Footage (${completedClips.length})`
                  : `Batch Results (${completedClips.length}/${clips.length} Ready)`}
              </h3>
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-white/[0.08] bg-[#0c0d12] shadow-lg hover:border-white/[0.15] transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                      <Film className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5 flex-1">
                      <p className="text-xs font-bold text-white tracking-tight truncate">
                        {clip.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                        <span className="font-semibold text-indigo-400">
                          {clip.actualOutputResolution || selectedResolution.toUpperCase()}
                        </span>
                        <span>•</span>
                        <span>{(clip.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                        {clip.throughputFps !== undefined && clip.throughputFps > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-zinc-300">{clip.throughputFps.toFixed(1)} FPS</span>
                          </>
                        )}
                        <span>•</span>
                        {clip.status === "completed" ? (
                          <span className="text-emerald-400 font-medium">
                            {clip.driveError ? "Ready (Drive skip)" : "Ready"}
                          </span>
                        ) : (
                          <span className="text-red-400 font-medium">{clip.error || "Failed"}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {clip.status === "completed" && clip.downloadUrl && (
                    <a
                      href={clip.downloadUrl}
                      download
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg bg-white/[0.08] hover:bg-white text-zinc-200 hover:text-black border border-white/10 text-xs font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-all cursor-pointer shrink-0 w-full sm:w-auto"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <ModelGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        selectedPreset={selectedPreset}
        onSelectPreset={handleSelectPreset}
      />

      <div className="pt-8" />
    </main>
  );
}
