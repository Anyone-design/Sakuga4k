"use client";

import React, { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Download, ExternalLink, RefreshCw, FolderArchive } from "lucide-react";
import type { VideoClip } from "@/types/contracts";

interface ComparisonSliderProps {
  clip: VideoClip;
  onUpscaleNewBatch: () => void;
  onDownloadAllZip?: () => void;
  totalCompletedClips?: number;
}

export function ComparisonSlider({
  clip,
  onUpscaleNewBatch,
  onDownloadAllZip,
  totalCompletedClips = 1,
}: ComparisonSliderProps) {
  const [splitPos, setSplitPos] = useState<number>(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  const handlePointerMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let percentage = ((clientX - rect.left) / rect.width) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    setSplitPos(percentage);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    handlePointerMove(e.clientX);
  };

  const handlePointerDrag = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      handlePointerMove(e.clientX);
    }
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="w-full space-y-4"
    >
      {/* Vmake AI Stationary Split Frame */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerDrag}
        onPointerUp={handlePointerUp}
        className="relative w-full aspect-[16/9] sm:aspect-[2.1/1] rounded-2xl overflow-hidden border border-white/[0.1] bg-[#07080c] cursor-ew-resize select-none shadow-2xl"
      >
        {/* Layer 1080p (Original soft line art) */}
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-[#07090e] pointer-events-none filter blur-[1.2px] opacity-75">
          <svg className="w-64 h-64 text-indigo-400" viewBox="0 0 200 200" fill="none">
            <path d="M40 120 C 60 70, 130 50, 170 100 C 140 130, 80 140, 40 120 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
            <circle cx="105" cy="98" r="22" stroke="currentColor" strokeWidth="2"/>
            <circle cx="108" cy="98" r="10" fill="#818CF8"/>
            <path d="M50 80 Q 90 40 140 65" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            <path d="M20 160 L 90 115" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </div>

        {/* Layer 4K (Reconstructed razor-sharp lines) with stationary clip-path */}
        <div
          className="absolute inset-0 w-full h-full flex items-center justify-center bg-[#05060a] pointer-events-none"
          style={{
            clipPath: `polygon(${splitPos}% 0%, 100% 0%, 100% 100%, ${splitPos}% 100%)`,
          }}
        >
          <svg className="w-64 h-64 text-white" viewBox="0 0 200 200" fill="none">
            <path d="M40 120 C 60 70, 130 50, 170 100 C 140 130, 80 140, 40 120 Z" stroke="#FFFFFF" strokeWidth="3.5" fill="none"/>
            <circle cx="105" cy="98" r="22" stroke="#FFFFFF" strokeWidth="3.5"/>
            <circle cx="108" cy="98" r="10" fill="#FFFFFF"/>
            <circle cx="112" cy="94" r="3.5" fill="#6366F1"/>
            <path d="M50 80 Q 90 40 140 65" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round"/>
            <path d="M20 160 L 90 115" stroke="#FFFFFF" strokeWidth="3"/>
            <path d="M120 70 L 160 30" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Divider Line & Precision Pill Handle */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none shadow-[0_0_12px_rgba(255,255,255,0.9)] z-20"
          style={{ left: `${splitPos}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 rounded-full bg-white text-black shadow-2xl flex items-center justify-center font-bold text-[8px]">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </div>
        </div>

        {/* Source and Enhanced Badges */}
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] text-zinc-300 font-medium">
          1080p Original
        </div>
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-[10px] text-white font-bold">
          4K Reconstructed
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-white/[0.08] bg-[#0b0c10]/90">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onUpscaleNewBatch}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Upscale New Batch</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {clip.drivePath && (
            <a
              href="https://drive.google.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
            >
              <span>Drive Sync</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            </a>
          )}

          {totalCompletedClips > 1 && onDownloadAllZip && (
            <button
              type="button"
              onClick={onDownloadAllZip}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-xs font-semibold text-white transition-colors"
            >
              <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
              <span>Download All (.ZIP)</span>
            </button>
          )}

          <a
            href={clip.downloadUrl && !clip.downloadUrl.startsWith("#") ? clip.downloadUrl : undefined}
            download={clip.name.replace(/\.[^/.]+$/, "_4K.mp4")}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!clip.downloadUrl || clip.downloadUrl.startsWith("#")) {
                e.preventDefault();
                alert("Processing output file is not ready yet.");
              }
            }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold tracking-tight shadow-xl transition-all ${
              !clip.downloadUrl || clip.downloadUrl.startsWith("#")
                ? "bg-white/[0.08] text-zinc-500 cursor-not-allowed"
                : "bg-white hover:bg-zinc-200 text-black cursor-pointer"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download 4K (.MP4)</span>
          </a>
        </div>
      </div>
    </motion.div>
  );
}
