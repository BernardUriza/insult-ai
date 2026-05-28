import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge Base",
  description:
    "Upload or paste documents into an Insult AI corpus for later grounded roasts and briefs.",
  alternates: {
    canonical: "/library",
  },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
