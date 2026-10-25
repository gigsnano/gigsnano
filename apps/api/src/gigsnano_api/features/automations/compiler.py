"""NL → structured rule compiler (GIN-252). Compiles plain language into an
inspectable AutomationAst over a fixed allowlist; anything unmapped goes into
`unsupported` (never silently dropped). Same extract-and-validate loop as the
intake enricher / gate reviewer."""

from pydantic import ValidationError

from gigsnano_api.bmad.provider import FakeProvider, LLMProvider
from gigsnano_api.features.automations.schemas import AutomationAst

_MAX_ATTEMPTS = 3

_SYSTEM = [{"type": "text", "text": (
    "You compile a plain-language project automation into a structured rule. Output ONLY "
    "the allowlisted vocabulary; put anything you cannot map into `unsupported` (never drop it).\n\n"
    "triggers: story.created | story.updated | schedule\n"
    "conditions: {field, op(eq|neq|contains|in), value} over the event's fields "
    "(e.g. type, priority, status, assignee_id).\n"
    "actions (type + params):\n"
    "  set_field {field, value}       — set status/priority/label_id/assignee_id/ai_agent_id\n"
    "  assign_persona {persona_id}    — e.g. agent_dev, agent_qa, agent_architect\n"
    "  create_work_item {title, description?, type?, priority?}\n"
    "  comment {body}\n"
    "Actions NOT in this list (post to Slack, send email/notify, publish a gig, call a webhook) "
    "are NOT supported — list them in `unsupported`, do not invent an action type."
)}]


async def compile_automation(
    provider: LLMProvider, text: str
) -> tuple[AutomationAst, int, int, bool]:
    messages = [{"role": "user", "content": text}]
    for _ in range(_MAX_ATTEMPTS):
        result = await provider.extract(
            system=_SYSTEM, messages=messages,
            tool_name="emit_rule", schema=AutomationAst.model_json_schema(),
        )
        try:
            ast = AutomationAst.model_validate(result.data)
            return ast, result.input_tokens or 0, result.output_tokens or 0, \
                isinstance(provider, FakeProvider)
        except ValidationError as err:
            messages = messages + [
                {"role": "assistant", "content": "emit_rule was invalid."},
                {"role": "user", "content": f"Failed validation:\n{err}\nEmit again, fixed."},
            ]
    # Couldn't produce a valid rule — return an empty rule flagging the whole request.
    return AutomationAst(trigger="story.created", unsupported=[text]), 0, 0, \
        isinstance(provider, FakeProvider)
