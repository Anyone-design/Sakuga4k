"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Aperture, Film, Focus, Layers, Check, ArrowRight } from "lucide-react";
import type { ModelPreset } from "@/types/contracts";

interface ModelGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPreset: ModelPreset;
  onSelectPreset: (preset: ModelPreset) => void;
}

interface ModelDetail {
  id: ModelPreset;
  technicalName: string;
  identityName: string;
  tag: string;
  bestFor: string;
  visualCharacter: string;
  speed: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

const MODEL_DETAILS: ModelDetail[] = [
  {
    id: "realcugan_pop",
    technicalName: "Real-CUGAN Pro",
    identityName: "Vibrant Pop",
    tag: "AMV & Reels",
    bestFor: "AMV edits, TikToks, Instagram Reels, and modern shonen fight cuts (e.g. Jujutsu Kaisen, Demon Slayer, Chainsaw Man).",
    visualCharacter: "Aggressive sub-pixel line restoration combined with an adaptive unsharp pop filter. Delivers high contrast, punchy contours, and deep, vivid color saturation that pops on OLED mobile displays.",
    speed: "~50 ms / frame (Fast)",
    icon: Aperture,
    accentColor: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400",
  },
  {
    id: "animevideov3",
    technicalName: "AnimeVideo-v3",
    identityName: "Sakuga Action",
    tag: "Fast Motion",
    bestFor: "Rapid camera sweeps, high-speed sword fights, flying debris, and intense sakuga animation.",
    visualCharacter: "Specially trained on consecutive anime video frames for temporal consistency. Eliminates frame-to-frame edge flickering and ghosting without artificial sharpening halos. Produces smooth, cinematic 2K/4K motion.",
    speed: "~40 ms / frame (Fastest)",
    icon: Film,
    accentColor: "from-indigo-500/20 to-blue-500/10 border-indigo-500/30 text-indigo-400",
  },
  {
    id: "animesharp",
    technicalName: "AnimeSharp 4x",
    identityName: "Eye & Line Precision",
    tag: "Close-Ups & Stills",
    bestFor: "Character close-ups, emotional dialogue scenes, eyes, eyelashes, hair strands, and aesthetic wallpaper captures.",
    visualCharacter: "Deep 6-block residual dense network focusing strictly on sub-pixel edge sharpness. Reconstructs fine black line art with razor-thin surgical precision while preserving delicate gradient shading.",
    speed: "~95 ms / frame (Deeper Network)",
    icon: Focus,
    accentColor: "from-purple-500/20 to-pink-500/10 border-purple-500/30 text-purple-400",
  },
  {
    id: "anime6b",
    technicalName: "Anime 6B",
    identityName: "Retro Revive",
    tag: "Classic & Low-Res",
    bestFor: "Vintage 90s/2000s anime (e.g. Classic Naruto, Bleach, Evangelion, Dragon Ball Z) or blurry 480p/720p clips downloaded from social media.",
    visualCharacter: "Deep perceptual de-noiser and artifact eraser. Erases blocky video compression squares and JPEG grain while preserving traditional cel-animation watercolor backgrounds without plastic smoothing.",
    speed: "~95 ms / frame (Deeper Network)",
    icon: Layers,
    accentColor: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400",
  },
];

export function ModelGuideModal({
  isOpen,
  onClose,
  selectedPreset,
  onSelectPreset,
}: ModelGuideModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md cursor-pointer"
          />

          {/* Slide-over Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="relative w-full max-w-lg h-full bg-[#08090d] border-l border-white/[0.08] shadow-2xl flex flex-col z-10 overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 px-6 py-5 border-b border-white/[0.1] flex items-center justify-between bg-[#0e1017]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white tracking-tight">Models Guide</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/25">
                    4 Neural Engines
                  </span>
                </div>
                <p className="text-xs text-zinc-400">Choose the ideal PyTorch architecture for your animation cut</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/15 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Model Cards List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {MODEL_DETAILS.map((model) => {
                const isSelected = selectedPreset === model.id;
                const Icon = model.icon;

                return (
                  <div
                    key={model.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-[#10121b] border-indigo-500/50 shadow-[0_0_24px_rgba(99,102,241,0.15)]"
                        : "bg-[#0c0d12] border-white/[0.07] hover:border-white/[0.12]"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center border bg-gradient-to-br ${model.accentColor}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white tracking-tight">
                              {model.technicalName}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium">
                              ({model.identityName})
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-zinc-300 font-semibold">
                        {model.tag}
                      </span>
                    </div>

                    <div className="space-y-2 pt-1 text-xs">
                      <div>
                        <span className="font-semibold text-zinc-300">Best for: </span>
                        <span className="text-zinc-400 font-normal">{model.bestFor}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-300">Visual character: </span>
                        <span className="text-zinc-400 font-normal">{model.visualCharacter}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 pt-0.5">
                        <span>Speed on Tesla T4: </span>
                        <span className="font-mono text-zinc-400">{model.speed}</span>
                      </div>
                    </div>

                    <div className="pt-3.5 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPreset(model.id);
                          onClose();
                        }}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer ${
                          isSelected
                            ? "bg-indigo-500 text-white shadow-lg"
                            : "bg-white/[0.06] hover:bg-white text-zinc-300 hover:text-black border border-white/10"
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Active Model</span>
                          </>
                        ) : (
                          <>
                            <span>Select Model</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Tip */}
            <div className="shrink-0 p-4 border-t border-white/[0.08] bg-[#0b0c10] text-[11px] text-zinc-500 flex items-center justify-between">
              <span>All models execute on PyTorch FP16 Tensor Cores</span>
              <button
                type="button"
                onClick={onClose}
                className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
