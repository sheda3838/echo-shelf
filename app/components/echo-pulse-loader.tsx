import React from "react";

export interface EchoPulseLoaderProps {
  mode?: "inline" | "page";
  text?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  textClassName?: string;
}

export default function EchoPulseLoader({
  mode = "inline",
  text,
  size = "sm",
  className = "",
  textClassName = "",
}: EchoPulseLoaderProps) {
  if (mode === "page") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`flex flex-col items-center justify-center min-h-[50vh] p-8 text-center select-none ${className}`}
      >
        <div className="relative flex items-center justify-center w-24 h-24 mb-5">
          {/* Outer Echo Ring 2 */}
          <div className="absolute inset-0 rounded-full border border-emerald-400/30 dark:border-emerald-400/25 animate-echo-ring-2" />
          {/* Inner Echo Ring 1 */}
          <div className="absolute inset-2.5 rounded-full border border-emerald-500/40 dark:border-emerald-400/35 animate-echo-ring-1" />
          
          {/* Ambient soft glow */}
          <div className="absolute w-12 h-12 rounded-full bg-emerald-500/15 dark:bg-emerald-400/20 blur-md pointer-events-none" />
          
          {/* Center Brand Echo Hub */}
          <div className="relative z-10 w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-900 to-emerald-950 dark:from-emerald-950 dark:to-zinc-900 border border-emerald-500/40 dark:border-emerald-400/30 shadow-sm flex items-center justify-center">
            {/* Spinning pulse ring */}
            <svg
              className="w-6 h-6 animate-echo-spin text-emerald-400 dark:text-emerald-300"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-20"
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <path
                className="opacity-90"
                fill="currentColor"
                d="M12 3a9 9 0 019 9h-2.5a6.5 6.5 0 00-6.5-6.5V3z"
              />
            </svg>
            {/* Center Mint Core */}
            <div className="absolute w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>
        </div>

        <p className={`text-sm font-semibold tracking-wide text-zinc-700 dark:text-zinc-300 ${textClassName}`}>
          {text || "Loading your shelf..."}
        </p>
        <span className="sr-only">{text || "Loading your shelf..."}</span>
      </div>
    );
  }

  // Inline Mode
  const iconSizeClasses =
    size === "md"
      ? "w-4 h-4"
      : size === "lg"
      ? "w-5 h-5"
      : "w-3.5 h-3.5";

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <span className="relative inline-flex items-center justify-center shrink-0">
        <svg
          className={`${iconSizeClasses} animate-echo-spin text-current`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          {/* Subtle background track */}
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="3"
          />
          {/* Active mint/emerald arc */}
          <path
            className="opacity-90"
            fill="currentColor"
            d="M12 3a9 9 0 019 9h-2.5a6.5 6.5 0 00-6.5-6.5V3z"
          />
        </svg>
        {/* Subtle center resonance pip */}
        <span className="absolute w-1 h-1 rounded-full bg-current opacity-80" />
      </span>
      {text && (
        <span className={`text-inherit font-inherit ${textClassName}`}>
          {text}
        </span>
      )}
    </span>
  );
}
