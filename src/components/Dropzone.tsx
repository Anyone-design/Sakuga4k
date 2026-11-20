"use client";

import React, { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { UploadCloud, Film, AlertCircle } from "lucide-react";

interface DropzoneProps {
  onFilesAdded: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".mkv", ".webm"];
const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"];

export function Dropzone({ onFilesAdded, disabled = false }: DropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filterAndEmitFiles = useCallback(
    (rawFiles: FileList | File[]) => {
      setDragError(null);
      const valid: File[] = [];
      const invalidNames: string[] = [];

      Array.from(rawFiles).forEach((file) => {
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        const matchesType = ACCEPTED_TYPES.includes(file.type);
        const matchesExt = ACCEPTED_EXTENSIONS.includes(ext);

        if (matchesType || matchesExt) {
          valid.push(file);
        } else {
          invalidNames.push(file.name);
        }
      });

      if (invalidNames.length > 0) {
        setDragError(`Unsupported file format. Please drop MP4, MOV, MKV, or WebM video cuts.`);
      }

      if (valid.length > 0) {
        onFilesAdded(valid);
      }
    },
    [onFilesAdded]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      filterAndEmitFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      filterAndEmitFiles(e.target.files);
      // Reset input value so re-uploading same file triggers change
      e.target.value = "";
    }
  };

  return (
    <div className="w-full space-y-2">
      <motion.div
        whileHover={disabled ? undefined : { scale: 1.005 }}
        whileTap={disabled ? undefined : { scale: 0.995 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative w-full aspect-[16/10] sm:aspect-[2.1/1] rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-between cursor-pointer transition-all duration-300 border ${
          isDragOver
            ? "border-indigo-500 bg-indigo-500/[0.06] shadow-[0_0_30px_rgba(99,102,241,0.25)]"
            : "border-white/[0.08] bg-[#0b0c10]/90 hover:border-white/[0.18] hover:bg-[#0f1117] shadow-xl"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp4,.mov,.mkv,.webm,video/*"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />

        {/* Top Header Row */}
        <div className="w-full flex items-center justify-between text-[11px] text-zinc-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span>Direct GPU Pipe</span>
          </div>
          <span>CRF 16 Lossless</span>
        </div>

        {/* Center Stage Upload Prompt */}
        <div className="space-y-3 flex flex-col items-center justify-center my-auto text-center pointer-events-none">
          <motion.div
            animate={isDragOver ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-white shadow-lg backdrop-blur-md"
          >
            {isDragOver ? (
              <UploadCloud className="w-6 h-6 text-indigo-400" />
            ) : (
              <Film className="w-6 h-6 text-zinc-300" />
            )}
          </motion.div>

          <div className="space-y-1">
            <div className="text-sm sm:text-base font-semibold text-white tracking-tight">
              Drop anime cuts to upscale
            </div>
            <div className="text-xs text-zinc-400 font-normal">
              Single clip or batch • MP4, MOV, MKV, WebM
            </div>
          </div>
        </div>

        {/* Bottom Metadata Badges */}
        <div className="w-full flex items-center justify-between text-[11px] text-zinc-500 font-medium pt-2">
          <span>1080p ➔ 4K UHD</span>
          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-400">
            Click to Browse
          </span>
        </div>
      </motion.div>

      {/* Drag Error Notification */}
      {dragError && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{dragError}</span>
        </motion.div>
      )}
    </div>
  );
}
