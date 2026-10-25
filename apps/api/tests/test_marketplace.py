from gigsnano_api.features.marketplace_talent.seed import seed_marketplace


async def _sign_up(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"})


async def test_jobs_list(client, db_session):
    await _sign_up(client)
    await seed_marketplace(db_session)
    res = await client.get("/api/marketplace/jobs/")
    assert res.status_code == 200
    jobs = res.json()
    assert len(jobs) == 12
    assert [j["id"] for j in jobs] == [f"mj-{i}" for i in range(1, 13)]  # sort_order preserved
    j = jobs[0]
    assert set(j) == {
        "id", "title", "description", "posted_at", "job_type", "hourly_min", "hourly_max",
        "fixed_budget", "experience_level", "duration_label", "hours_per_week_label",
        "category", "skills", "proposals_label", "interviewing", "invites_sent", "client"}
    assert "sort_order" not in j
    assert set(j["client"]) == {
        "payment_verified", "rating", "reviews_count", "total_spent_usd", "avg_hourly_paid",
        "hires", "country", "jobs_posted", "hire_rate_pct", "industry", "company_size", "member_since"}
    assert j["job_type"] == "hourly"
    assert j["client"]["rating"] == 5.0


async def test_job_detail_and_404(client, db_session):
    await _sign_up(client)
    await seed_marketplace(db_session)
    ok = await client.get("/api/marketplace/jobs/mj-1/")
    assert ok.status_code == 200 and ok.json()["id"] == "mj-1"
    missing = await client.get("/api/marketplace/jobs/nope/")
    assert missing.status_code == 404


async def test_talent_list_and_detail(client, db_session):
    await _sign_up(client)
    await seed_marketplace(db_session)
    res = await client.get("/api/marketplace/talent/")
    assert res.status_code == 200
    talent = res.json()
    assert len(talent) == 8
    f = talent[0]
    assert set(f) == {
        "id", "name", "avatar_url", "title", "country", "city", "hourly_rate",
        "job_success_pct", "badge", "total_earned_label", "jobs_count", "hours_worked",
        "available_now", "skills", "overview", "languages", "verifications",
        "hours_per_week_label", "member_since", "work_history"}
    assert set(f["work_history"][0]) == {"title", "rating", "period_label", "amount_label", "feedback"}
    detail = await client.get("/api/marketplace/talent/mf-1/")
    assert detail.status_code == 200 and detail.json()["badge"] == "top_rated_plus"
    assert (await client.get("/api/marketplace/talent/nope/")).status_code == 404


async def test_marketplace_requires_auth(client, db_session):
    await seed_marketplace(db_session)
    res = await client.get("/api/marketplace/jobs/")
    assert res.status_code in (401, 403)
