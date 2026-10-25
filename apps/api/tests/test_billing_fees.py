from gigsnano_api.billing.fees import compute_fee_cents, get_platform_fee_bps


def test_fee_percentage_on_top():
    assert compute_fee_cents(1000, 2000) == 200      # $10 @ 20% = $2
    assert compute_fee_cents(1000, 0) == 0


def test_fee_rounds_half_up():
    assert compute_fee_cents(999, 2000) == 200       # 199.8 → 200
    assert compute_fee_cents(1, 2000) == 0           # 0.2 → 0


async def test_get_platform_fee_seeds_default(db_session):
    bps = await get_platform_fee_bps(db_session)
    assert bps == 2000
