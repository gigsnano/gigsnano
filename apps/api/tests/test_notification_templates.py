
from gigsnano_api.notifications.render import render_template, unknown_placeholders


def test_render_template_substitutes_known_keys():
    title, body = render_template(
        "{story}",
        "{actor} assigned you in {project}",
        {"actor": "Grace", "project": "App", "story": "Fix bug"},
    )
    assert title == "Fix bug"
    assert body == "Grace assigned you in App"


def test_render_template_missing_keys_become_empty():
    title, body = render_template("{story}", "{actor} in {project}", {"story": "Only title"})
    assert title == "Only title"
    assert body == " in "


def test_unknown_placeholders():
    assert unknown_placeholders("{actor} on {story}", ["actor", "story"]) == []
    assert unknown_placeholders("{actor} {foo}", ["actor"]) == ["foo"]
