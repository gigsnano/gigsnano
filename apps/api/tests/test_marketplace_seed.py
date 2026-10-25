from sqlalchemy import func, select

from gigsnano_api.features.marketplace_talent.seed import (
    FREELANCERS,
    MARKETPLACE_JOBS,
    seed_marketplace,
)
from gigsnano_api.models import Freelancer, MarketplaceJob


def test_seed_constants_shape():
    assert len(MARKETPLACE_JOBS) == 12
    assert len(FREELANCERS) == 8
    # ids + sort_order follow fixture order
    assert [j["id"] for j in MARKETPLACE_JOBS] == [f"mj-{i}" for i in range(1, 13)]
    assert [j["sort_order"] for j in MARKETPLACE_JOBS] == list(range(1, 13))
    assert [f["id"] for f in FREELANCERS] == [f"mf-{i}" for i in range(1, 9)]
    # every job dict carries the flattened client fields
    assert "client_payment_verified" in MARKETPLACE_JOBS[0]
    assert "client" not in MARKETPLACE_JOBS[0]


async def test_seed_marketplace_is_idempotent(db_session):
    await seed_marketplace(db_session)
    await seed_marketplace(db_session)  # second call must not duplicate
    jobs = (await db_session.execute(select(func.count()).select_from(MarketplaceJob))).scalar()
    talent = (await db_session.execute(select(func.count()).select_from(Freelancer))).scalar()
    assert jobs == 12
    assert talent == 8
