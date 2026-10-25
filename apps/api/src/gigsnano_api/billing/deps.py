from fastapi import Request

from gigsnano_api.payments.provider import PaymentProvider


def get_payment_provider(request: Request) -> PaymentProvider:
    return request.app.state.payment_provider
