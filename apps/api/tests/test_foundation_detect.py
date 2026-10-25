from gigsnano_api.features.foundation.presets import suggest_preset


def test_suggest_preset_matches_next():
    assert suggest_preset({"react", "next", "tailwindcss"}) == "next-shadcn"


def test_suggest_preset_matches_vite():
    assert suggest_preset({"react", "react-dom", "vite"}) == "react-vite-tailwind"
    assert suggest_preset({"react", "react-router-dom"}) == "react-vite-tailwind"


def test_suggest_preset_none_when_ambiguous_or_empty():
    assert suggest_preset({"react"}) is None
    assert suggest_preset(set()) is None
    assert suggest_preset({"vue", "vite"}) is None  # react required
