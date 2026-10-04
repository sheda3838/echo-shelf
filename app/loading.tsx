import React from "react";
import EchoPulseLoader from "./components/echo-pulse-loader";

export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center font-sans">
      <EchoPulseLoader mode="page" text="Loading your shelf..." />
    </div>
  );
}
