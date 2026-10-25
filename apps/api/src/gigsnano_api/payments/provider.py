"""Payment provider seam. FakePaymentProvider (keyless dev) ↔ StripePaymentProvider.
All Stripe SDK calls are synchronous, so real methods run them in a thread executor
to avoid blocking the event loop."""

import asyncio
import functools
import logging
from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

from gigsnano_api.core.config import settings
from gigsnano_api.models import EConnectStatus


@dataclass
class TopupResult:
    checkout_url: str        # browser redirects here (Stripe Checkout, or the success page in fake mode)
    provider_ref: str        # Stripe session id (or fake id)
    immediate: bool          # True ⇒ dev/fake: credit now, no webhook will fire


@dataclass
class CheckoutResult:
    checkout_url: str        # browser redirects here (Stripe Checkout / Portal, or a fake success page)
    provider_ref: str        # Stripe session id (or fake id)
    immediate: bool = False  # True ⇒ dev/fake: apply the tier now, no webhook will fire


class StripeConfigError(Exception):
    """Raised when Stripe is selected but not configured."""


def map_stripe_error(err: Exception) -> tuple[int, str]:
    """Map a Stripe SDK error to (http_status, message)."""
    http = getattr(err, "http_status", None)
    code = str(getattr(err, "code", "") or "").lower()
    name = type(err).__name__
    if http == 429 or "rate_limit" in code:
        return 429, "Payment provider is rate-limiting — try again shortly."
    if name == "CardError" or code == "card_declined":
        return 402, "Card was declined."
    if http in (500, 502, 503, 504):
        return 502, "Payment provider error — try again."
    return 400, f"Payment error: {err}"


class PaymentProvider(Protocol):
    async def create_topup(self, amount_cents: int, workspace_id: str, workspace_slug: str) -> TopupResult: ...
    async def create_subscription_checkout(
        self, tier: str, interval: str, workspace_id: str, workspace_slug: str,
        customer_id: str | None, price_id: str | None,
    ) -> CheckoutResult: ...
    async def ensure_stripe_price(
        self, tier: str, interval: str, amount_cents: int, currency: str,
        product_id: str | None, prior_price_id: str | None,
    ) -> tuple[str, str]: ...
    async def create_billing_portal(self, customer_id: str | None, workspace_slug: str) -> str: ...
    def verify_webhook(self, payload: bytes, sig: str) -> dict: ...
    async def create_connect_account(self, user_id: str) -> str: ...
    async def onboarding_link(self, account_id: str) -> str: ...
    async def account_status(self, account_id: str) -> tuple[EConnectStatus, bool]: ...
    async def transfer(self, amount_cents: int, account_id: str, ref_id: str) -> str: ...


class FakePaymentProvider:
    """Keyless dev: immediate credit, auto-active Connect, no-op transfers."""

    def _next(self, prefix: str) -> str:
        return f"{prefix}{uuid4().hex[:16]}"

    async def create_topup(self, amount_cents, workspace_id, workspace_slug):
        url = f"{settings.app_base_url}/{workspace_slug}/settings/billing?topup=success"
        return TopupResult(checkout_url=url, provider_ref=self._next("fake_pi_"), immediate=True)

    async def create_subscription_checkout(
        self, tier, interval, workspace_id, workspace_slug, customer_id, price_id=None
    ):
        url = (
            f"{settings.app_base_url}/{workspace_slug}/settings/billing"
            f"?checkout=success&tier={tier}&interval={interval}"
        )
        # No Stripe webhook fires in fake mode, so the caller applies the upgrade now.
        return CheckoutResult(checkout_url=url, provider_ref=self._next("fake_sub_"), immediate=True)

    async def ensure_stripe_price(
        self, tier, interval, amount_cents, currency, product_id=None, prior_price_id=None
    ):
        # Keyless dev: deterministic-ish fake ids, no real Stripe objects.
        return product_id or self._next("fake_prod_"), self._next("fake_price_")

    async def create_billing_portal(self, customer_id, workspace_slug):
        return f"{settings.app_base_url}/{workspace_slug}/settings/billing?portal=fake"

    def verify_webhook(self, payload, sig):
        import json
        return json.loads(payload or b"{}")

    async def create_connect_account(self, user_id):
        return self._next("fake_acct_")

    async def onboarding_link(self, account_id):
        return f"{settings.stripe_connect_return_url}?fake_onboard={account_id}"

    async def account_status(self, account_id):
        return EConnectStatus.ACTIVE, True

    async def transfer(self, amount_cents, account_id, ref_id):
        return self._next("fake_tr_")


class StripePaymentProvider:
    """Real Stripe. Sync SDK calls are offloaded to a thread executor."""

    def __init__(self) -> None:
        import stripe
        if not settings.stripe_secret_key:
            raise StripeConfigError("STRIPE_SECRET_KEY not set")
        stripe.api_key = settings.stripe_secret_key
        stripe.api_version = settings.stripe_api_version
        self._stripe = stripe

    async def _run(self, fn, **kwargs):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, functools.partial(fn, **kwargs))

    async def create_topup(self, amount_cents, workspace_id, workspace_slug):
        base = settings.app_base_url
        session = await self._run(
            self._stripe.checkout.Session.create,
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": "Wallet top-up"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            metadata={"workspace_id": workspace_id, "kind": "wallet_topup"},
            success_url=f"{base}/{workspace_slug}/settings/billing?topup=success",
            cancel_url=f"{base}/{workspace_slug}/settings/billing?topup=cancelled",
        )
        return TopupResult(checkout_url=session.url, provider_ref=session.id, immediate=False)

    async def create_subscription_checkout(
        self, tier, interval, workspace_id, workspace_slug, customer_id, price_id=None
    ):
        # price_id is resolved from the DB plan_prices config by the caller.
        if not price_id:
            raise StripeConfigError(f"No Stripe price configured for {tier}/{interval}")
        base = settings.app_base_url
        kwargs = dict(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            metadata={"workspace_id": workspace_id, "kind": "subscription", "tier": tier},
            subscription_data={"metadata": {"workspace_id": workspace_id, "tier": tier}},
            success_url=f"{base}/{workspace_slug}/settings/billing?checkout=success",
            cancel_url=f"{base}/{workspace_slug}/settings/billing?checkout=cancelled",
        )
        if customer_id:
            kwargs["customer"] = customer_id
        session = await self._run(self._stripe.checkout.Session.create, **kwargs)
        return CheckoutResult(checkout_url=session.url, provider_ref=session.id)

    async def ensure_stripe_price(
        self, tier, interval, amount_cents, currency, product_id=None, prior_price_id=None
    ):
        """Create (or reuse) a Stripe Product for the tier and a new recurring Price
        for the amount. Stripe Prices are immutable, so a changed amount ⇒ new Price;
        the prior one is archived (best-effort)."""
        if not product_id:
            product = await self._run(
                self._stripe.Product.create, name=f"GigsNano {tier.capitalize()}"
            )
            product_id = product.id
        price = await self._run(
            self._stripe.Price.create,
            product=product_id,
            currency=currency,
            unit_amount=amount_cents,
            recurring={"interval": "year" if interval == "annual" else "month"},
        )
        if prior_price_id:
            try:  # archive the superseded price so it can't be purchased anymore
                await self._run(
                    functools.partial(self._stripe.Price.modify, prior_price_id), active=False
                )
            except Exception:  # noqa: BLE001 — archiving is cleanup, never block the update
                logging.getLogger(__name__).warning(
                    "could not archive superseded Stripe price %s", prior_price_id, exc_info=True
                )
        return product_id, price.id

    async def create_billing_portal(self, customer_id, workspace_slug):
        if not customer_id:
            raise StripeConfigError("No Stripe customer to open the billing portal for")
        session = await self._run(
            self._stripe.billing_portal.Session.create,
            customer=customer_id,
            return_url=f"{settings.app_base_url}/{workspace_slug}/settings/billing",
        )
        return session.url

    def verify_webhook(self, payload, sig):
        import json

        from stripe._webhook import WebhookSignature

        body = payload.decode("utf-8") if hasattr(payload, "decode") else payload
        WebhookSignature.verify_header(body, sig, settings.stripe_webhook_secret)
        return json.loads(body)

    async def create_connect_account(self, user_id):
        acct = await self._run(self._stripe.Account.create, type="express", metadata={"user_id": user_id})
        return acct.id

    async def onboarding_link(self, account_id):
        link = await self._run(
            self._stripe.AccountLink.create,
            account=account_id,
            return_url=settings.stripe_connect_return_url,
            refresh_url=settings.stripe_connect_refresh_url,
            type="account_onboarding",
        )
        return link.url

    async def account_status(self, account_id):
        acct = await self._run(self._stripe.Account.retrieve, id=account_id)
        payouts = bool(acct.get("payouts_enabled"))
        return (EConnectStatus.ACTIVE if payouts else EConnectStatus.PENDING), payouts

    async def transfer(self, amount_cents, account_id, ref_id):
        tr = await self._run(
            self._stripe.Transfer.create,
            amount=amount_cents, currency="usd", destination=account_id,
            transfer_group=ref_id, idempotency_key=f"payout_{ref_id}",
        )
        return tr.id


def build_default_payment_provider() -> PaymentProvider:
    if settings.stripe_secret_key:
        return StripePaymentProvider()
    return FakePaymentProvider()
