"use client";

import React from "react";
import { motion } from "framer-motion";
import { Cpu, Gauge, Loader2, XCircle } from "lucide-react";
import type { ProcessingStage, VideoClip } from "@/types/contracts";

interface ProgressVisualizerProps {
  clip: VideoClip;
  batchIndex: number;
  totalBatchClips: number;
  onCancel: () => void;
}

const PRESET_DISPLAY: Record<string, string> = {
  animevideov3: "Fast Video v3 • Action & AMVs",
  animesharp: "AnimeSharp 4x • Close-ups & Stills",
  realcugan_pop: "Real-CUGAN Pro • Vibrant Pop",
  anime6b: "Anime 6B • Retro Classic",
};

const STAGE_DISPLAY: Record<ProcessingStage, string> = {
  queued: "Waiting for GPU lock",
  extracting: "Extracting raw frames",
  probing: "Auto-tuning GPU VRAM",
  upscaling: "Neural batch inference",
  reassembling: "Fast MP4 reassembly",
  syncing: "Syncing to Google Drive",
  completed: "Finalized",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function ProgressVisualizer({
  clip,
  batchIndex,
  totalBatchClips,
  onCancel,
}: ProgressVisualizerProps) {
  const percent = Math.min(100, Math.max(0, Math.round(clip.progressPercent)));
  const etaText = clip.etaSeconds > 0 ? `${clip.etaSeconds.toFixed(1)}s remaining` : "Finalizing...";
  const stageLabel = (clip.stage && STAGE_DISPLAY[clip.stage]) || "PyTorch FP16 Turbo";
  const outputLabel = clip.actualOutputResolution || clip.targetResolution;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full rounded-2xl p-5 sm:p-8 flex flex-col gap-6 border border-white/[0.08] bg-[#0b0c10]/95 shadow-2xl overflow-hidden"
    >
      {/* Top Telemetry Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400" />
          </span>
          <span className="font-bold text-white tracking-tight truncate">
            {clip.name}
          </span>
          <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-zinc-300 text-[11px] font-medium shrink-0">
            Clip {batchIndex + 1}/{totalBatchClips}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-indigo-300 font-medium shrink-0">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
          <span>{stageLabel}</span>
        </div>
      </div>

      {/* Center Hero Percentage & Capsule Bar */}
      <div className="space-y-4 py-2 sm:py-4 w-full max-w-lg mx-auto">
        <div className="text-center">
          <span className="text-5xl sm:text-6xl font-extrabold text-white tracking-tighter tabular-nums leading-none">
            {percent}%
          </span>
        </div>

        {/* Dynamic Capsule Progress Track */}
        <div className="relative w-full bg-white/[0.06] rounded-full h-3 overflow-hidden border border-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 via-indigo-300 to-white rounded-full relative"
            style={{ width: `${percent}%` }}
            transition={{ ease: "easeOut", duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse" />
          </motion.div>
        </div>

        {/* Balanced Frame Count & ETA Row */}
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-400 font-medium px-0.5 tabular-nums">
          <span>
            Frame {clip.currentFrame} / {clip.totalFrames || 120}
          </span>
          <span>{etaText}</span>
        </div>

        {/* Live v1.1 Auto-Batch, FPS, VRAM & Resolution Strip */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] text-zinc-400">
          {clip.activeBatchSize !== undefined && clip.activeBatchSize > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-zinc-200 font-medium">
              <Cpu className="w-3 h-3 text-indigo-400 shrink-0" />
              <span>Auto-Batch {clip.activeBatchSize}</span>
            </span>
          )}
          {clip.throughputFps !== undefined && clip.throughputFps > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-zinc-200 font-medium">
              <Gauge className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>{clip.throughputFps.toFixed(1)} FPS</span>
            </span>
          )}
          {clip.vramUsedMB !== undefined && clip.vramUsedMB > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-zinc-300">
              {(clip.vramUsedMB / 1024).toFixed(1)} GB VRAM
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.07] text-zinc-300 font-medium">
            {outputLabel}
          </span>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-500 border-t border-white/[0.06] pt-4">
        <div className="space-y-0.5 min-w-0">
          <span className="font-medium text-zinc-300 block truncate">
            {PRESET_DISPLAY[clip.modelPreset] || clip.modelPreset}
          </span>
          <span className="text-[11px] text-zinc-500 block">
            CRF 16 Visually Lossless • Medium Pop Line Clarity
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 sm:py-1.5 rounded-lg bg-white/[0.04] sm:bg-transparent border border-white/[0.08] sm:border-transparent text-zinc-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 transition-colors cursor-pointer w-full sm:w-auto shrink-0"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Cancel Session</span>
        </button>
      </div>
    </motion.div>
  );
}
