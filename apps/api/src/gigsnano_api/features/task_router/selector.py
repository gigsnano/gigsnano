"""Persona + skill selector (GIN-227): classify a task, then pick the best-fit
persona (domain expert from the artifact roster, else the type-matched BMAD
persona) + skill artifacts, with a cited rationale. Grounded in the visible
persona/skill artifacts (GIN-194/230)."""

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.agents.router import BMAD_AGENTS
from gigsnano_api.features.foundation import artifacts as A
from gigsnano_api.features.task_router.classifier import classify_domain, classify_type
from gigsnano_api.features.task_router.required_skills import extract_required_skills

_TYPE_PERSONA = {
    "test": "agent_qa",
    "docs": "agent_analyst",
    "design": "agent_ux",
    "architecture": "agent_architect",
    "bug": "agent_dev",
    "feature": "agent_dev",
}
_TYPE_SKILLS = {
    "test": ["skill:testing-tdd"],
    "design": ["skill:emil-design-eng", "skill:transitions-dev"],
    "bug": ["skill:testing-tdd"],
}


async def route_task(db: AsyncSession, workspace_id: str, text: str) -> dict:
    domain, signals = classify_domain(text)
    task_type = classify_type(text)
    # Explicit "Required agent skills" the item declared beat keyword inference
    # (GIN-309): they make the skill set correct even when type-classification is
    # imperfect (e.g. an implementation item whose acceptance criteria mention tests).
    explicit_skills = extract_required_skills(text)
    personas = await A.list_visible(db, workspace_id, "persona")

    expert = None
    if domain != "general":
        expert = next((p for p in personas if A.persona_domain(p["name"]) == domain), None)

    if expert:
        # High confidence is only earned when the domain match rests on cited
        # signals (GIN-292) — never on a lone generic keyword.
        persona_id, persona_name = expert["id"], expert["name"]
        confidence = "high"
        rationale = (
            f"Classified as {domain} / {task_type} on signals {signals}; "
            f"routed to domain expert {persona_name}."
        )
        citations = [
            {"type": "artifact", "ref": expert["id"]},
            *({"type": "signal", "ref": k} for k in signals),
        ]
    else:
        persona_id = _TYPE_PERSONA.get(task_type, "agent_dev")
        persona_name = next((a["name"] for a in BMAD_AGENTS if a["id"] == persona_id), persona_id)
        # A domain task with no matching expert is a low-confidence fallback (flag for review).
        confidence = "low" if domain != "general" else "medium"
        why = "no domain expert available — generalist fallback" if domain != "general" else "general task"
        rationale = f"Classified as {domain} / {task_type}; routed to {persona_name} ({why})."
        citations = [{"type": "persona", "ref": persona_id}]

    # Explicit skills first (order-preserving), then the type-inferred defaults.
    inferred_skills = _TYPE_SKILLS.get(task_type, [])
    skills = list(dict.fromkeys([*explicit_skills, *inferred_skills]))
    if explicit_skills:
        rationale += f" Honoured {len(explicit_skills)} explicit required skill(s)."

    return {
        "domain": domain,
        "task_type": task_type,
        "persona_id": persona_id,
        "persona_name": persona_name,
        "skills": skills,
        "explicit_skills": explicit_skills,
        "inferred_skills": inferred_skills,
        "confidence": confidence,
        "rationale": rationale,
        "citations": citations,
    }
