"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Film, X, CheckCircle2, Loader2, AlertCircle, Clock } from "lucide-react";
import type { VideoClip } from "@/types/contracts";

interface QueueListProps {
  clips: VideoClip[];
  onRemoveClip: (id: string) => void;
  onClearQueue: () => void;
  onSelectClip?: (id: string) => void;
  selectedClipId?: string;
  isProcessing?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function QueueList({
  clips,
  onRemoveClip,
  onClearQueue,
  onSelectClip,
  selectedClipId,
  isProcessing = false,
}: QueueListProps) {
  if (clips.length === 0) return null;

  const totalBytes = clips.reduce((acc, c) => acc + c.sizeBytes, 0);

  return (
    <div className="w-full space-y-3">
      {/* Queue Header Bar */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <div className="flex items-center gap-2 font-medium">
          <span className="text-white font-bold">{clips.length}</span>
          <span>{clips.length === 1 ? "clip queued" : "clips queued"}</span>
          <span>•</span>
          <span>{formatBytes(totalBytes)}</span>
        </div>
        {!isProcessing && (
          <button
            type="button"
            onClick={onClearQueue}
            className="text-zinc-500 hover:text-zinc-300 text-[11px] transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Queue Stack */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {clips.map((clip, index) => {
            const isSelected = clip.id === selectedClipId;
            return (
              <motion.div
                key={clip.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onSelectClip?.(clip.id)}
                className={`group flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "bg-[#141722] border-indigo-500/40 shadow-md"
                    : "bg-[#0b0c10]/80 border-white/[0.07] hover:border-white/[0.15] hover:bg-[#0f1118]"
                } ${onSelectClip ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-400 shrink-0">
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white tracking-tight truncate max-w-[220px] sm:max-w-md">
                      {clip.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span>{formatBytes(clip.sizeBytes)}</span>
                      <span>•</span>
                      <span>{clip.targetResolution}</span>
                    </div>
                  </div>
                </div>

                {/* Status Pill & Remove Action */}
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={clip.status} progress={clip.progressPercent} />
                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveClip(clip.id);
                      }}
                      className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-colors opacity-70 group-hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusBadge({ status, progress }: { status: VideoClip["status"]; progress: number }) {
  if (status === "processing" || status === "uploading") {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-semibold">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        <span>{status === "uploading" ? "Uploading" : `${progress}%`}</span>
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
        <CheckCircle2 className="w-2.5 h-2.5" />
        <span>Ready</span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-semibold">
        <AlertCircle className="w-2.5 h-2.5" />
        <span>Failed</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-zinc-400 text-[10px] font-medium">
      <Clock className="w-2.5 h-2.5" />
      <span>Queued</span>
    </span>
  );
}
