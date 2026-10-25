from dataclasses import dataclass


@dataclass(frozen=True)
class Preset:
    key: str
    label: str
    allowed_libraries: tuple[str, ...]
    enforce_design_tokens: bool
    quality_gates: tuple[str, ...]


PRESETS: dict[str, Preset] = {
    "next-shadcn": Preset(
        key="next-shadcn",
        label="Next.js + shadcn/Tailwind",
        allowed_libraries=(
            "react",
            "react-dom",
            "next",
            "@tanstack/react-query",
            "zustand",
            "clsx",
            "tailwind-merge",
            "lucide-react",
        ),
        enforce_design_tokens=True,
        quality_gates=("react-doctor",),
    ),
    "react-vite-tailwind": Preset(
        key="react-vite-tailwind",
        label="React + Vite + Tailwind",
        allowed_libraries=(
            "react",
            "react-dom",
            "react-router-dom",
            "@tanstack/react-query",
            "zustand",
            "clsx",
            "tailwind-merge",
            "lucide-react",
        ),
        enforce_design_tokens=True,
        quality_gates=("react-doctor",),
    ),
}


def suggest_preset(deps: set[str]) -> str | None:
    """Pick the preset that best matches a repo's package.json dependency names.
    ponytail: naive keyword match; extend as the preset catalog grows."""
    if "next" in deps:
        return "next-shadcn"
    if "react" in deps and ("vite" in deps or "react-router-dom" in deps):
        return "react-vite-tailwind"
    return None
