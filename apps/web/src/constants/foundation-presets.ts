/** Curated Foundation presets for the selection gallery (MVP static source;
 * a real GET can replace this later without touching consumers). */
export interface IFoundationPreset {
  key: string;
  label: string;
  description: string;
  allowed_libraries: string[];
  enforce_design_tokens: boolean;
  quality_gates: string[];
}

export const FOUNDATION_PRESETS: IFoundationPreset[] = [
  {
    key: "next-shadcn",
    label: "Next.js + shadcn/Tailwind",
    description: "React + Next, shadcn design tokens, react-doctor quality gate.",
    allowed_libraries: [
      "react",
      "react-dom",
      "next",
      "@tanstack/react-query",
      "zustand",
      "clsx",
      "tailwind-merge",
      "lucide-react",
    ],
    enforce_design_tokens: true,
    quality_gates: ["react-doctor"],
  },
  {
    key: "react-vite-tailwind",
    label: "React + Vite + Tailwind",
    description: "React + Vite (no Next), React Router, shadcn tokens, react-doctor quality gate.",
    allowed_libraries: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "zustand",
      "clsx",
      "tailwind-merge",
      "lucide-react",
    ],
    enforce_design_tokens: true,
    quality_gates: ["react-doctor"],
  },
];
