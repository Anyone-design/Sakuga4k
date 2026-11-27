"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, ExternalLink, Settings2, CheckCircle2, AlertCircle, RefreshCw, BookOpen } from "lucide-react";
import type { HealthStatus } from "@/types/contracts";

const STORAGE_KEY = "sakuga4k_tunnel_url";

export function Header() {
  const [tunnelUrl, setTunnelUrl] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkHealth = useCallback(async (url: string) => {
    let sanitized = url.trim().replace(/\/+$/, "");
    if (!sanitized) {
      setHealth(null);
      return;
    }
    if (!sanitized.startsWith("http://") && !sanitized.startsWith("https://")) {
      sanitized = `https://${sanitized}`;
    }
    setIsChecking(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${sanitized}/api/health`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data: HealthStatus = await res.json();
        setHealth(data);
        setErrorMsg(null);
      } else {
        setHealth(null);
        setErrorMsg(`HTTP ${res.status}`);
      }
    } catch (err: unknown) {
      setHealth(null);
      const message = err instanceof Error ? err.message : "Connection failed";
      setErrorMsg(message);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Load persisted tunnel URL on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setTunnelUrl(saved);
        checkHealth(saved);
      }
    } catch (err: unknown) {
      console.warn("[Sakuga4K] Failed to read localStorage:", err);
    }
  }, [checkHealth]);

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sanitized = tunnelUrl.trim().replace(/\/+$/, "");
      localStorage.setItem(STORAGE_KEY, sanitized);
      setTunnelUrl(sanitized);
      checkHealth(sanitized);
      setIsOpen(false);
    } catch (err: unknown) {
      console.warn("[Sakuga4K] Failed to write localStorage:", err);
    }
  };

  const isOnline = health?.status === "online";

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-[#050507]/80 backdrop-blur-xl"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-white text-black font-extrabold flex items-center justify-center text-[10px] tracking-tight">
            4K
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold tracking-tight text-white">Sakuga4K</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded text-zinc-400 bg-white/[0.06] font-medium border border-white/[0.08]">
              STUDIO
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded text-indigo-300 bg-indigo-500/15 font-semibold border border-indigo-500/25 tracking-tight">
              v1.1
            </span>
          </div>
        </div>

        {/* Actions & Live Tunnel Status Pill */}
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("open-model-guide"));
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>Models</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => setIsOpen((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-colors ${isOnline
                ? "bg-emerald-500/[0.08] border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/[0.14]"
                : "bg-white/[0.04] border-white/[0.1] text-zinc-400 hover:text-white hover:bg-white/[0.08]"
              }`}
          >
            <span className="relative flex h-2 w-2">
              {isOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? "bg-emerald-400" : "bg-amber-400"
                  }`}
              />
            </span>
            <span className="font-semibold text-zinc-200">
              {isOnline ? health?.gpuModel ?? "Colab GPU" : "Connect Colab"}
            </span>
            <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
          </motion.button>
        </div>

      </div>

      {/* Slide-Down Tunnel Configuration Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-white/[0.07] bg-[#0b0c10]/95 px-4 sm:px-6 py-4 overflow-hidden"
          >
            <div className="max-w-xl mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <Radio className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Cloudflare Quick Tunnel Endpoint</span>
                </div>
                {tunnelUrl && (
                  <button
                    type="button"
                    onClick={() => checkHealth(tunnelUrl)}
                    disabled={isChecking}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded px-1 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${isChecking ? "animate-spin text-indigo-400" : ""}`} />
                    <span>Ping</span>
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveUrl} className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://xyz-random-name.trycloudflare.com"
                  value={tunnelUrl}
                  onChange={(e) => setTunnelUrl(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-indigo-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 transition-colors"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 transition-colors"
                >
                  Save
                </button>
              </form>

              {/* Status readout */}
              <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                <div className="flex items-center gap-1.5">
                  {isOnline ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-emerald-400 font-medium">
                        {health.gpuModel}
                        {health.vramTotalMB > 0
                          ? ` • ${health.vramFreeMB}/${health.vramTotalMB} MB Free`
                          : " • FP16 Ready"}
                        {health.engineVersion ? ` (v${health.engineVersion})` : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>{errorMsg ? `Offline: ${errorMsg}` : "Paste your Cloudflare Tunnel URL"}</span>
                    </>
                  )}
                </div>
                <a
                  href="https://colab.research.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded px-1 transition-colors"
                >
                  <span>Open Colab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
