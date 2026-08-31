"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

import type { ProjectContentPlatform, ProjectType } from "@/lib/db/types";

export function projectTypeLabel(type?: ProjectType): string {
  return type === "content" ? "Content creation" : "Dev project";
}

export function repositoryLabel(url?: string): string {
  if (!url) return "Not connected";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "github.com" || parsed.hostname.endsWith(".github.com")) {
      const repo = parsed.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
      return repo || "GitHub";
    }
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function GithubLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.1c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

export function TechStackChip({ name }: { name: string }) {
  const logo = techLogo(name);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-neutral-950 px-2 py-1 text-xs text-neutral-300 md:rounded">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {logo}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function platformLabel(platform: ProjectContentPlatform): string {
  const labels: Record<ProjectContentPlatform, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    x: "X",
    blog: "Blog",
    newsletter: "Newsletter",
    podcast: "Podcast",
  };
  return labels[platform];
}

export function PlatformChip({ platform }: { platform: ProjectContentPlatform }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-neutral-950 px-2 py-1 text-xs text-neutral-300 md:rounded">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {platformLogo(platform)}
      </span>
      <span className="truncate">{platformLabel(platform)}</span>
    </span>
  );
}

export function PlatformLogo({
  platform,
  className,
}: {
  platform: ProjectContentPlatform;
  className?: string;
}) {
  return <span className={className}>{platformLogo(platform)}</span>;
}

function platformLogo(platform: ProjectContentPlatform) {
  if (platform === "youtube") return <YouTubeLogo className="h-4 w-4 text-red-500" />;
  if (platform === "tiktok") return <TikTokLogo className="h-4 w-4 text-neutral-100" />;
  if (platform === "instagram") return <InstagramLogo className="h-4 w-4 text-pink-400" />;
  if (platform === "x") return <XLogo className="h-4 w-4 text-neutral-100" />;
  if (platform === "blog") return <BlogLogo className="h-4 w-4 text-amber-300" />;
  if (platform === "newsletter") return <NewsletterLogo className="h-4 w-4 text-cyan-300" />;
  return <PodcastLogo className="h-4 w-4 text-violet-300" />;
}

function techLogo(name: string) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key.includes("next")) return <NextLogo className="h-4 w-4 text-neutral-100" />;
  if (key.includes("react")) return <ReactLogo className="h-4 w-4 text-sky-300" />;
  if (key.includes("typescript") || key === "ts") return <TsLogo className="h-4 w-4 text-blue-400" />;
  if (key.includes("firebase")) return <FirebaseLogo className="h-4 w-4 text-amber-300" />;
  if (key.includes("tailwind")) return <TailwindLogo className="h-4 w-4 text-cyan-300" />;
  if (key.includes("vercel")) return <VercelLogo className="h-4 w-4 text-neutral-100" />;
  if (key.includes("node")) return <NodeLogo className="h-4 w-4 text-green-400" />;
  if (key.includes("supabase")) return <SupabaseLogo className="h-4 w-4 text-emerald-400" />;
  if (key.includes("python")) return <PythonLogo className="h-4 w-4 text-yellow-300" />;
  if (key.includes("figma")) return <FigmaLogo className="h-4 w-4" />;
  if (key.includes("youtube")) return <YouTubeLogo className="h-4 w-4 text-red-500" />;
  if (key.includes("tiktok")) return <TikTokLogo className="h-4 w-4 text-neutral-100" />;
  if (key.includes("canva")) return <CanvaLogo className="h-4 w-4 text-cyan-300" />;
  return <span className="h-2 w-2 rounded-sm bg-neutral-500" />;
}

function Svg({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox="0 0 24 24" className={clsx("fill-current", className)} aria-hidden="true">
      {children}
    </svg>
  );
}

function NextLogo({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 8h1.6l4.2 6.4V8H16v8h-1.6l-4.2-6.4V16H9V8Z" className="fill-black" />
    </Svg>
  );
}

function ReactLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TsLogo({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 8h8v2h-3v7h-2v-7H7V8Zm9.2 8.9c-1.2 0-2.1-.3-2.8-.9l.9-1.6c.6.4 1.2.7 1.9.7.6 0 1-.2 1-.6 0-.3-.3-.5-1.2-.8-1.5-.5-2.3-1.1-2.3-2.4 0-1.4 1.1-2.4 2.9-2.4 1 0 1.8.2 2.4.7l-.8 1.6c-.5-.3-1-.5-1.6-.5s-.9.2-.9.5c0 .4.4.5 1.3.8 1.6.5 2.3 1.1 2.3 2.4 0 1.6-1.2 2.5-3.1 2.5Z" className="fill-neutral-950" />
    </Svg>
  );
}

function FirebaseLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="m4 19 2.4-15 4 7.5L12 8l8 11-8 3-8-3Zm8-8.4-1.1 2.5 3.4 6.2 3.4-1.2L12 10.6Z" /></Svg>;
}

function TailwindLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M12 7c-2.7 0-4.4 1.3-5.2 4 1-1.3 2.1-1.8 3.4-1.5.7.2 1.2.7 1.8 1.3 1 1 2.2 2.2 4.7 2.2 2.7 0 4.4-1.3 5.2-4-1 1.3-2.1 1.8-3.4 1.5-.7-.2-1.2-.7-1.8-1.3-1-1-2.2-2.2-4.7-2.2ZM7.3 13c-2.7 0-4.4 1.3-5.2 4 1-1.3 2.1-1.8 3.4-1.5.7.2 1.2.7 1.8 1.3 1 1 2.2 2.2 4.7 2.2 2.7 0 4.4-1.3 5.2-4-1 1.3-2.1 1.8-3.4 1.5-.7-.2-1.2-.7-1.8-1.3-1-1-2.2-2.2-4.7-2.2Z" /></Svg>;
}

function VercelLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M12 4 22 20H2L12 4Z" /></Svg>;
}

function NodeLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-3 7v6h2v-4.2l3 4.2h2V9h-2v4.1L11 9H9Z" /></Svg>;
}

function SupabaseLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M13.5 22 21 9.5h-7.2L15.2 2 3 14.8h7.4L9 22h4.5Z" /></Svg>;
}

function PythonLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M12.1 2c-3 0-4.5.9-4.5 2.8V8h5.1v1H5.8C3.7 9 2 10.5 2 12.8c0 2.2 1.6 3.7 3.7 3.7h1.5v-2.8c0-2.1 1.7-3.8 3.8-3.8h5.6V4.8C16.6 2.9 15.1 2 12.1 2Zm-2.8 2.1a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm7.5 3.4v2.8c0 2.1-1.7 3.8-3.8 3.8H7.4v5.1c0 1.9 1.5 2.8 4.5 2.8s4.5-.9 4.5-2.8V16h-5.1v-1h6.9c2.1 0 3.8-1.5 3.8-3.8 0-2.2-1.6-3.7-3.7-3.7h-1.5Zm-2.1 10.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" /></Svg>;
}

function FigmaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="9" cy="6" r="3" fill="#f24e1e" />
      <circle cx="15" cy="6" r="3" fill="#ff7262" />
      <circle cx="9" cy="12" r="3" fill="#a259ff" />
      <circle cx="15" cy="12" r="3" fill="#1abcfe" />
      <circle cx="9" cy="18" r="3" fill="#0acf83" />
    </svg>
  );
}

function YouTubeLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M21.6 7.2a3 3 0 0 0-2.1-2.1C17.7 4.6 12 4.6 12 4.6s-5.7 0-7.5.5a3 3 0 0 0-2.1 2.1C2 9 2 12 2 12s0 3 .4 4.8a3 3 0 0 0 2.1 2.1c1.8.5 7.5.5 7.5.5s5.7 0 7.5-.5a3 3 0 0 0 2.1-2.1C22 15 22 12 22 12s0-3-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z" /></Svg>;
}

function TikTokLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M16 3c.4 2.6 1.9 4.2 4.5 4.4v3.3A8 8 0 0 1 16 9.4v6.2c0 3.2-2.2 5.4-5.5 5.4A5.2 5.2 0 0 1 5 15.8c0-3 2.3-5.3 5.3-5.3.4 0 .8 0 1.1.1V14c-.3-.1-.6-.1-.9-.1-1.2 0-2.1.8-2.1 1.9s.9 1.9 2 1.9c1.3 0 2.1-.8 2.1-2.4V3H16Z" /></Svg>;
}

function CanvaLogo({ className }: { className?: string }) {
  return <Svg className={className}><circle cx="12" cy="12" r="10" /><path d="M15.8 9.5c-.7-1-1.8-1.5-3.2-1.5-2.6 0-4.5 1.9-4.5 4.3 0 2.2 1.6 3.7 3.8 3.7 1.5 0 2.9-.6 3.9-1.8l-1.3-1c-.7.8-1.5 1.2-2.4 1.2-1.2 0-2-.8-2-2.1 0-1.5 1-2.7 2.4-2.7.8 0 1.4.3 1.8.9l1.5-1Z" className="fill-neutral-950" /></Svg>;
}

function InstagramLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="16.8" cy="7.2" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M4 4h4.2l4.7 6 5-6H21l-6.7 7.9L21 20h-4.2l-5-6.4L6.5 20H3.2l7.1-8.4L4 4Zm3 2 10.7 12h1.1L8.1 6H7Z" /></Svg>;
}

function BlogLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M5 3h11l3 3v15H5V3Zm3 6h8V7H8v2Zm0 4h8v-2H8v2Zm0 4h5v-2H8v2Z" /></Svg>;
}

function NewsletterLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M3 6h18v12H3V6Zm2.4 2 6.6 4.6L18.6 8H5.4ZM5 10.4V16h14v-5.6l-7 4.9-7-4.9Z" /></Svg>;
}

function PodcastLogo({ className }: { className?: string }) {
  return <Svg className={className}><path d="M12 3a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V8a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3a3 3 0 0 1-6 0V8a3 3 0 0 1 3-3Zm-7 6h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11Z" /></Svg>;
}
