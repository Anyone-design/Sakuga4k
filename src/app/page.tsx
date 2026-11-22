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

export default function StudioPage() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<ModelPreset>("animevideov3");
  const [selectedResolution, setSelectedResolution] = useState<"2k" | "4k">("2k");
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [flowState, setFlowState] = useState<"drop" | "progress" | "complete">("drop");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Store raw browser File objects for real HTTP multipart upload
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const activeEventSourceRef = useRef<EventSource | null>(null);

  // Listen for global open-model-guide events (from Header or shortcuts)
  useEffect(() => {
    const handleOpen = () => setIsGuideOpen(true);
    window.addEventListener("open-model-guide", handleOpen);
    return () => window.removeEventListener("open-model-guide", handleOpen);
  }, []);

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
          originalResolution: "Auto",
          targetResolution: selectedResolution === "2k" ? "2560x1440 (2K)" : "3840x2160 (4K)",
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
    [activeClipId, selectedPreset, selectedResolution]
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
        formData.append("resolution", selectedResolution);

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

  const getTunnelUrl = () => {
    try {
      return (localStorage.getItem(STORAGE_KEY) || "").trim().replace(/\/+$/, "");
    } catch {
      return "";
    }
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
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.08] bg-[#0c0d12]">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white tracking-tight">Export Resolution</span>
                <p className="text-[11px] text-zinc-400">2K plays smoothly on all mobile devices; 4K is desktop UHD.</p>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-black/40 border border-white/5">
                <button
                  type="button"
                  onClick={() => setSelectedResolution("2k")}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold tracking-tight transition-all cursor-pointer ${
                    selectedResolution === "2k"
                      ? "bg-white text-black shadow-md"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  2K • Mobile (1440p)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedResolution("4k")}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold tracking-tight transition-all cursor-pointer ${
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
                  className="w-full py-3.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold tracking-tight shadow-2xl transition-all cursor-pointer"
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
                originalResolution: "1920x1080",
                targetResolution: "3840x2160",
                modelPreset: selectedPreset,
                status: "processing",
                progressPercent: 5,
                currentFrame: 1,
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
            <div className="relative w-full rounded-2xl p-6 sm:p-8 border border-emerald-500/20 bg-[#070d0a]/90 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Neural Upscale Complete</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                    {clips.filter((c) => c.status === "completed").length} {clips.filter((c) => c.status === "completed").length === 1 ? "Clip" : "Clips"} Ready in {selectedResolution.toUpperCase()}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Visually lossless CRF 16 • Native aspect ratio preserved • Universal mobile playback enabled
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 pt-1">
                    <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Synced to Google Drive: <code className="text-zinc-300">My Drive &gt; Sakuga4K_Upscaled</code></span>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-col items-stretch gap-2.5 shrink-0">
                  <a
                    href={`${getTunnelUrl()}/api/download-zip`}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold tracking-tight shadow-xl transition-all cursor-pointer"
                  >
                    <FolderArchive className="w-4 h-4" />
                    <span>Download All (ZIP)</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      fileMapRef.current.clear();
                      setClips([]);
                      setActiveClipId(null);
                      setErrorMessage(null);
                      setFlowState("drop");
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-zinc-300 text-xs font-medium transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Upscale New Batch</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Individual Completed Clips Cards */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold tracking-tight text-zinc-400 uppercase">
                Completed Footage ({clips.filter((c) => c.status === "completed").length})
              </h3>
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-white/[0.08] bg-[#0c0d12] shadow-lg hover:border-white/[0.15] transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                      <Film className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-bold text-white tracking-tight truncate max-w-[200px] sm:max-w-md">
                        {clip.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                        <span className="font-semibold text-indigo-400">
                          {selectedResolution.toUpperCase()}
                        </span>
                        <span>•</span>
                        <span>{(clip.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-medium">Ready</span>
                      </div>
                    </div>
                  </div>

                  {clip.downloadUrl && (
                    <a
                      href={clip.downloadUrl}
                      download
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white text-zinc-200 hover:text-black border border-white/10 text-xs font-semibold tracking-tight transition-all cursor-pointer shrink-0"
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
