import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat",
  description:
    "Talk to Insult AI in roast, brief, or clinical mode with guardrails and live progress.",
  alternates: {
    canonical: "/chat",
  },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
