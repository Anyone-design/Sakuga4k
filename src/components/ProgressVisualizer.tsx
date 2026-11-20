"use client";

import React from "react";
import { motion } from "framer-motion";
import { Loader2, XCircle } from "lucide-react";
import type { VideoClip } from "@/types/contracts";

interface ProgressVisualizerProps {
  clip: VideoClip;
  batchIndex: number;
  totalBatchClips: number;
  onCancel: () => void;
}

const PRESET_DISPLAY: Record<string, string> = {
  animevideov3: "Fast Video v3 • Action & AMVs",
  animesharp: "AnimeSharp 4x • Close-ups & Stills",
  realcugan_pop: "Real-CUGAN Pro • Vmake Killer + Pop",
  anime6b: "Anime 6B • Retro Classic",
};

export function ProgressVisualizer({
  clip,
  batchIndex,
  totalBatchClips,
  onCancel,
}: ProgressVisualizerProps) {
  const percent = Math.min(100, Math.max(0, Math.round(clip.progressPercent)));
  const etaText = clip.etaSeconds > 0 ? `${clip.etaSeconds.toFixed(1)}s remaining` : "Finalizing...";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full aspect-[16/10] sm:aspect-[2.1/1] rounded-2xl p-6 sm:p-10 flex flex-col justify-between border border-white/[0.08] bg-[#0b0c10]/95 shadow-2xl overflow-hidden"
    >
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400" />
          </span>
          <span className="font-bold text-white tracking-tight truncate max-w-[200px] sm:max-w-sm">
            {clip.name}
          </span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400">
            Clip {batchIndex + 1} of {totalBatchClips}
          </span>
        </div>
        <div className="flex items-center gap-2 text-zinc-400 font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
          <span>PyTorch FP16</span>
        </div>
      </div>

      {/* Center Dynamic Telemetry & Capsule Bar */}
      <div className="space-y-4 my-auto max-w-md mx-auto w-full text-center">
        <div className="flex items-baseline justify-between text-xs px-1 text-zinc-400 font-medium">
          <span>
            Frame {clip.currentFrame} / {clip.totalFrames || 120}
          </span>
          <span className="text-5xl sm:text-6xl font-extrabold text-white tracking-tighter">
            {percent}%
          </span>
          <span>{etaText}</span>
        </div>

        {/* Dynamic Capsule Progress Track */}
        <div className="relative w-full bg-white/[0.06] rounded-full h-2.5 overflow-hidden border border-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-500 via-indigo-300 to-white rounded-full relative"
            style={{ width: `${percent}%` }}
            transition={{ ease: "easeOut", duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse" />
          </motion.div>
        </div>

        <div className="text-[11px] text-zinc-500 font-normal">
          Visually Lossless CRF 16 Reassembly • {clip.targetResolution}
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/[0.06] pt-3">
        <span className="font-medium text-zinc-300">{PRESET_DISPLAY[clip.modelPreset] || clip.modelPreset}</span>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Cancel Session</span>
        </button>
      </div>
    </motion.div>
  );
}
