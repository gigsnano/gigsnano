from gigsnano_api.models import ECloneStatus, Project


def test_project_has_repo_and_clone_columns():
    cols = Project.__table__.columns.keys()
    for c in ("repo_full_name", "repo_url", "repo_default_branch", "clone_status", "clone_error"):
        assert c in cols
    assert ECloneStatus.PENDING.value == "pending"
