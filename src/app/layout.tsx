import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Tracker",
  description:
    "A mobile-first personal tracker for workouts, weekly check-ins, and progress over time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg text-neutral-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
