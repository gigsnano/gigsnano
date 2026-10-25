from fastapi import Request

from gigsnano_api.email.provider import EmailProvider


def get_email_provider(request: Request) -> EmailProvider:
    return request.app.state.email_provider
