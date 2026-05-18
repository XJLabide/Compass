"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Themed markdown renderer for Nori's assistant messages.
 *
 * - GFM tables / strikethrough / task lists
 * - No raw HTML (default safe)
 * - Custom Tailwind-styled elements that match the dark Compass theme
 */
export default function NoriMarkdown({ children }: { children: string }) {
  return (
    <div className="prose-nori">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="text-sm leading-relaxed text-neutral-100">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-neutral-50">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-neutral-200">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-1.5 list-disc space-y-1 pl-5 text-sm text-neutral-100">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 list-decimal space-y-1 pl-5 text-sm text-neutral-100">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed">{children}</li>
          ),
          h1: ({ children }) => (
            <h1 className="mt-2 text-base font-semibold text-neutral-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-2 text-sm font-semibold text-neutral-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 text-sm font-semibold text-neutral-200">
              {children}
            </h3>
          ),
          code: ({ children, className }) => {
            const inline = !className;
            if (inline) {
              return (
                <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[12px] text-cyan-200">
                  {children}
                </code>
              );
            }
            return (
              <code className="block whitespace-pre-wrap font-mono text-[11px] text-cyan-200">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md bg-neutral-950/70 p-2.5 text-[11px] leading-relaxed">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-accent/50 pl-2.5 text-sm italic text-neutral-300">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:brightness-110"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-2 border-border" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full text-[12px] text-neutral-200">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-2 py-1 text-left font-semibold text-neutral-100">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/40 px-2 py-1">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
