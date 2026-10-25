from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from gigsnano_api.core.schemas import Email


class SignUpPayload(BaseModel):
    display_name: str
    email: Email
    password: str


class SignInPayload(BaseModel):
    email: Email
    password: str


class GoogleAuthPayload(BaseModel):
    id_token: str


class ForgotPasswordPayload(BaseModel):
    email: Email


class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str


class VerifyEmailPayload(BaseModel):
    token: str


class AuthUserOut(BaseModel):
    """Matches the frontend's IAuthUser (src/types/auth.ts).

    from_attributes: auth routes return the User ORM object directly.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    display_name: str
    email: str
    avatar_url: str | None
    last_workspace_slug: str | None
    mcp_active_workspace_slug: str | None = None
    email_digest: bool
    product_updates: bool
    email_verified: bool


class MobileLoginPayload(BaseModel):
    email: Email
    password: str
    device_name: str = Field("", max_length=120)


class MobileGooglePayload(BaseModel):
    id_token: str
    device_name: str = Field("", max_length=120)


class MobileApplePayload(BaseModel):
    identity_token: str
    device_name: str = Field("", max_length=120)


class MobileRefreshPayload(BaseModel):
    refresh_token: str


class MobileHandoffCreatePayload(BaseModel):
    # Loose bounds here; charset/length/method are checked in the handler so the web
    # page gets a 400 `invalid_challenge` rather than a generic 422.
    code_challenge: str = Field(max_length=256)
    code_challenge_method: str = Field(max_length=16)
    redirect_uri: str = Field(max_length=300)


class MobileHandoffOut(BaseModel):
    code: str
    expires_in: int


class MobileHandoffExchangePayload(BaseModel):
    code: str = Field(max_length=128)
    # Loose bounds: length/charset are checked after the code is burned, so a malformed
    # verifier still consumes the code instead of failing validation with a 422.
    code_verifier: str = Field(min_length=1, max_length=256)
    redirect_uri: str = Field(max_length=300)
    device_name: str = Field("", max_length=120)


class MobileTokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int


class MobileAuthOut(MobileTokensOut):
    user: AuthUserOut
