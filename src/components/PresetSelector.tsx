"use client";

import React from "react";
import { motion } from "framer-motion";
import { Zap, Sparkles, Layers } from "lucide-react";
import type { ModelPreset } from "@/types/contracts";

interface PresetSelectorProps {
  selected: ModelPreset;
  onSelect: (preset: ModelPreset) => void;
  disabled?: boolean;
}

interface PresetOption {
  id: ModelPreset;
  name: string;
  tag: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRESETS: PresetOption[] = [
  {
    id: "animevideov3",
    name: "Fast Video v3",
    tag: "Action & AMVs",
    description: "Temporal consistency eliminates line flickering during fast cuts.",
    icon: Zap,
  },
  {
    id: "animesharp",
    name: "AnimeSharp 4x",
    tag: "Close-ups & Stills",
    description: "Sub-pixel clean line reconstruction with high contrast fidelity.",
    icon: Sparkles,
  },
  {
    id: "anime6b",
    name: "Anime 6B",
    tag: "Art & Shading",
    description: "Deep gradient preservation for high-detail backgrounds.",
    icon: Layers,
  },
];

export function PresetSelector({ selected, onSelect, disabled = false }: PresetSelectorProps) {
  return (
    <div className="w-full space-y-2">
      <div className="text-xs font-semibold text-zinc-400 px-1 flex items-center justify-between">
        <span>Neural Upscale Preset</span>
        <span className="text-[10px] text-zinc-500">PyTorch FP16 Tensor Cores</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {PRESETS.map((preset) => {
          const isSelected = selected === preset.id;
          const Icon = preset.icon;

          return (
            <motion.button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(preset.id)}
              whileHover={disabled ? undefined : { scale: 1.015 }}
              whileTap={disabled ? undefined : { scale: 0.985 }}
              transition={{ type: "spring", stiffness: 450, damping: 25 }}
              className={`relative p-3.5 rounded-xl text-left border transition-all ${
                isSelected
                  ? "bg-[#141724] border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                  : "bg-[#0b0c10]/80 border-white/[0.07] hover:border-white/[0.14] hover:bg-[#0f1118]"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {isSelected && (
                <motion.div
                  layoutId="activePresetGlow"
                  className="absolute inset-0 rounded-xl border-2 border-indigo-500/60 pointer-events-none"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className="flex items-center justify-between pb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center ${
                      isSelected ? "bg-indigo-500/20 text-indigo-400" : "bg-white/[0.04] text-zinc-400"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-white tracking-tight">{preset.name}</span>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                    isSelected
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                      : "bg-white/[0.04] text-zinc-500 border border-white/[0.06]"
                  }`}
                >
                  {preset.tag}
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                {preset.description}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
