"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { Dropzone } from "@/components/Dropzone";
import { QueueList } from "@/components/QueueList";
import { PresetSelector } from "@/components/PresetSelector";
import { ProgressVisualizer } from "@/components/ProgressVisualizer";
import { ComparisonSlider } from "@/components/ComparisonSlider";
import type { VideoClip, ModelPreset } from "@/types/contracts";

const STORAGE_KEY = "sakuga4k_tunnel_url";

export default function StudioPage() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<ModelPreset>("animevideov3");
  const [flowState, setFlowState] = useState<"drop" | "progress" | "complete">("drop");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Store raw browser File objects for real HTTP multipart upload
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const activeEventSourceRef = useRef<EventSource | null>(null);

  // Clean up active SSE on unmount
  useEffect(() => {
    return () => {
      if (activeEventSourceRef.current) {
        activeEventSourceRef.current.close();
      }
    };
  }, []);

  const handleFilesAdded = useCallback(
    (files: File[]) => {
      setErrorMessage(null);
      const newClips: VideoClip[] = files.map((file) => {
        const id = crypto.randomUUID();
        fileMapRef.current.set(id, file);
        return {
          id,
          name: file.name,
          sizeBytes: file.size,
          originalResolution: "1920x1080",
          targetResolution: "3840x2160",
          modelPreset: selectedPreset,
          status: "queued",
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
    [activeClipId, selectedPreset]
  );

  const handleSelectPreset = useCallback((preset: ModelPreset) => {
    setSelectedPreset(preset);
    // Dynamically update preset for all currently queued clips
    setClips((prev) =>
      prev.map((c) => (c.status === "queued" ? { ...c, modelPreset: preset } : c))
    );
  }, []);

  const handleRemoveClip = useCallback((id: string) => {
    fileMapRef.current.delete(id);
    setClips((prev) => prev.filter((c) => c.id !== id));
    setActiveClipId((curr) => (curr === id ? null : curr));
  }, []);

  const handleClearQueue = useCallback(() => {
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
      activeEventSourceRef.current = null;
    }
    fileMapRef.current.clear();
    setClips([]);
    setActiveClipId(null);
    setErrorMessage(null);
    setFlowState("drop");
  }, []);

  // Real Multi-Clip Pipeline execution via Cloudflare Tunnel
  const handleStartUpscale = async () => {
    if (clips.length === 0) return;
    setErrorMessage(null);

    // 1. Validate Tunnel Endpoint
    let tunnelUrl = "";
    try {
      tunnelUrl = (localStorage.getItem(STORAGE_KEY) || "").trim().replace(/\/+$/, "");
    } catch (err: unknown) {
      console.warn("[Sakuga4K] Failed to read tunnel URL:", err);
    }

    if (!tunnelUrl) {
      setErrorMessage(
        "Colab GPU is not connected. Please click 'Connect Colab' in the top header, paste your Cloudflare tunnel link, and then start upscaling."
      );
      return;
    }

    const queuedClips = clips.filter((c) => c.status === "queued" || c.status === "processing");
    if (queuedClips.length === 0) return;

    setFlowState("progress");

    // 2. Process Clips Sequentially
    for (const clip of queuedClips) {
      setActiveClipId(clip.id);
      const rawFile = fileMapRef.current.get(clip.id);

      if (!rawFile) {
        setClips((prev) =>
          prev.map((c) =>
            c.id === clip.id
              ? { ...c, status: "failed", error: "File handle expired. Please re-drop the clip." }
              : c
          )
        );
        continue;
      }

      setClips((prev) =>
        prev.map((c) => (c.id === clip.id ? { ...c, status: "processing", progressPercent: 1 } : c))
      );

      try {
        // Upload clip to Colab backend
        const formData = new FormData();
        formData.append("file", rawFile);
        formData.append("preset", clip.modelPreset);

        const uploadRes = await fetch(`${tunnelUrl}/api/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload rejected by Colab with HTTP ${uploadRes.status}`);
        }

        const jobData = await uploadRes.json();
        const backendJobId = jobData.id;

        // Stream real-time inference telemetry via SSE
        await new Promise<void>((resolve, reject) => {
          const es = new EventSource(`${tunnelUrl}/api/progress/${backendJobId}`);
          activeEventSourceRef.current = es;

          es.addEventListener("progress", (event) => {
            try {
              const progressData = JSON.parse(event.data);
              const isDone = progressData.status === "completed";
              const isFailed = progressData.status === "failed";

              setClips((prev) =>
                prev.map((c) =>
                  c.id === clip.id
                    ? {
                        ...c,
                        status: isDone ? "completed" : isFailed ? "failed" : "processing",
                        progressPercent: progressData.progressPercent ?? c.progressPercent,
                        currentFrame: progressData.currentFrame ?? c.currentFrame,
                        totalFrames: progressData.totalFrames ?? c.totalFrames,
                        etaSeconds: progressData.etaSeconds ?? c.etaSeconds,
                        downloadUrl: isDone ? `${tunnelUrl}/api/download/${backendJobId}` : undefined,
                        drivePath: progressData.drivePath,
                        error: progressData.error,
                      }
                    : c
                )
              );

              if (isDone) {
                es.close();
                activeEventSourceRef.current = null;
                resolve();
              } else if (isFailed) {
                es.close();
                activeEventSourceRef.current = null;
                reject(new Error(progressData.error || "Inference failed on Colab"));
              }
            } catch (parseErr) {
              console.error("Telemetry parse error:", parseErr);
            }
          });

          es.onerror = () => {
            es.close();
            activeEventSourceRef.current = null;
            // Fallback verification probe
            fetch(`${tunnelUrl}/api/progress/${backendJobId}`)
              .then((r) => r.json())
              .then((statusPayload) => {
                if (statusPayload.status === "completed") {
                  setClips((prev) =>
                    prev.map((c) =>
                      c.id === clip.id
                        ? {
                            ...c,
                            status: "completed",
                            progressPercent: 100,
                            downloadUrl: `${tunnelUrl}/api/download/${backendJobId}`,
                            drivePath: statusPayload.drivePath,
                          }
                        : c
                    )
                  );
                  resolve();
                } else {
                  reject(new Error("Connection to Colab tunnel lost during inference"));
                }
              })
              .catch(() => reject(new Error("Lost connection to Colab tunnel")));
          };
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Processing failed";
        setClips((prev) =>
          prev.map((c) => (c.id === clip.id ? { ...c, status: "failed", error: msg } : c))
        );
        setErrorMessage(`Processing error for ${clip.name}: ${msg}`);
      }
    }

    setFlowState("complete");
  };

  const handleCancelSession = () => {
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
      activeEventSourceRef.current = null;
    }
    setFlowState("drop");
  };

  const activeClip = clips.find((c) => c.id === activeClipId) || clips[0];
  const activeIndex = clips.findIndex((c) => c.id === activeClipId);

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-between">
      
      {/* Hero Headline */}
      <div className="space-y-2 text-center pb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          {flowState === "drop" && "Upscale anime."}
          {flowState === "progress" && "Synthesizing 4K UHD."}
          {flowState === "complete" && "Footage ready."}
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 font-normal">
          {flowState === "drop" && "Native 4K neural line-art reconstruction with zero paywalls."}
          {flowState === "progress" && "PyTorch FP16 neural tensor inference on Google Colab GPU."}
          {flowState === "complete" && "Visually lossless CRF 16 • Compare line crispness before export."}
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

        <AnimatePresence mode="wait">
          {flowState === "drop" && (
            <motion.div
              key="stage-drop"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <Dropzone onFilesAdded={handleFilesAdded} />
              
              <PresetSelector
                selected={selectedPreset}
                onSelect={handleSelectPreset}
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
                    className="w-full py-3.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold tracking-tight shadow-2xl transition-all"
                  >
                    Start 4K Upscale ({clips.length} {clips.length === 1 ? "Clip" : "Clips"})
                  </motion.button>
                </div>
              )}
            </motion.div>
          )}

          {flowState === "progress" && activeClip && (
            <motion.div
              key="stage-progress"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <ProgressVisualizer
                clip={activeClip}
                batchIndex={Math.max(0, activeIndex)}
                totalBatchClips={clips.length}
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

          {flowState === "complete" && activeClip && (
            <motion.div
              key="stage-complete"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <ComparisonSlider
                clip={activeClip}
                onUpscaleNewBatch={() => {
                  fileMapRef.current.clear();
                  setClips([]);
                  setActiveClipId(null);
                  setErrorMessage(null);
                  setFlowState("drop");
                }}
                totalCompletedClips={clips.filter((c) => c.status === "completed").length}
              />

              <QueueList
                clips={clips}
                onRemoveClip={handleRemoveClip}
                onClearQueue={handleClearQueue}
                onSelectClip={setActiveClipId}
                selectedClipId={activeClipId || undefined}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pt-8" />
    </main>
  );
}
