"""Code-defined, security-owned email bodies + a shared HTML shell.

Not admin-editable (unlike notification templates)."""

from datetime import datetime

# GigsNano accent (indigo-600), matches the app primary.
_BRAND = "#4f46e5"


def email_shell(preheader: str, body_html: str, unsubscribe_url: str | None = None) -> str:
    """Branded chrome: gray canvas, GigsNano wordmark, white card, footer.

    `preheader` is hidden inbox-preview text — all visible content lives in `body_html`.
    ponytail: div + inline styles (renders in Gmail/Apple Mail/Outlook-web); add
    table-based bulletproofing only if Outlook desktop parity is ever needed.
    """
    unsub = (
        f' &middot; <a href="{unsubscribe_url}" style="color:#9ca3af">Unsubscribe</a>'
        if unsubscribe_url
        else ""
    )
    return (
        '<div style="background:#f4f5f7;padding:24px 0;font-family:-apple-system,'
        'Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
        f'<span style="display:none;max-height:0;overflow:hidden;opacity:0">{preheader}</span>'
        '<div style="max-width:560px;margin:0 auto">'
        f'<div style="padding:4px 8px 16px;font-weight:700;font-size:18px;color:{_BRAND}">'
        "GigsNano</div>"
        '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px">'
        f"{body_html}</div>"
        '<div style="padding:16px 8px;color:#9ca3af;font-size:12px">'
        f"You're receiving this from GigsNano{unsub}</div>"
        "</div></div>"
    )


_H1 = '<h1 style="margin:0 0 16px;font-size:20px;color:#111827">{}</h1>'


def password_reset_email(display_name: str, link: str) -> tuple[str, str]:
    body = (
        _H1.format("Reset your password")
        + f"<p>Hi {display_name},</p>"
        f"<p>Reset your password with the link below (valid 1 hour):</p>"
        f'<p><a href="{link}">Reset password</a></p>'
        f"<p>If you didn't request this, ignore this email.</p>"
    )
    return "Reset your GigsNano password", email_shell("Reset your GigsNano password", body)


def verify_email(display_name: str, link: str) -> tuple[str, str]:
    body = (
        _H1.format("Verify your email")
        + f"<p>Hi {display_name},</p>"
        f"<p>Confirm your email address:</p>"
        f'<p><a href="{link}">Verify email</a></p>'
    )
    return "Verify your GigsNano email", email_shell("Verify your GigsNano email", body)


def invite_email(
    workspace_name: str,
    inviter_name: str,
    role: str,
    link: str,
    expires_at: datetime,
) -> tuple[str, str]:
    """Workspace invitation (GIN-526).

    Carries who invited them, what access they get and when it lapses — an
    invitation with none of that is indistinguishable from phishing. The link
    is also spelled out in full: mail clients that strip anchors would
    otherwise leave the recipient with no way to accept.
    """
    expires = expires_at.strftime("%d %b %Y at %H:%M UTC")
    body = (
        _H1.format("You're invited")
        + f"<p><b>{inviter_name}</b> invited you to join <b>{workspace_name}</b> "
        f"on GigsNano as <b>{role}</b>.</p>"
        f'<p><a href="{link}">Accept invitation</a></p>'
        f'<p style="color:#6b7280;font-size:13px">This invitation expires on {expires}. '
        "If the button doesn't work, paste this link into your browser:<br>"
        f'<span style="word-break:break-all">{link}</span></p>'
        '<p style="color:#6b7280;font-size:13px">Didn\'t expect this? You can ignore '
        "this email — nothing happens until you accept.</p>"
    )
    return f"{inviter_name} invited you to {workspace_name}", email_shell(
        f"You're invited to {workspace_name}", body
    )


def project_transfer_email(
    project_name: str, source_name: str, dest_name: str, link: str
) -> tuple[str, str]:
    body = (
        _H1.format("Project transfer request")
        + f"<p><b>{source_name}</b> would like to transfer the project "
        f"<b>{project_name}</b> to <b>{dest_name}</b> on GigsNano.</p>"
        f"<p>As the owner of {dest_name}, you can accept or decline. If you accept, "
        f"the project and all of its work items, documents, and history move into "
        f"{dest_name}.</p>"
        f'<p><a href="{link}">Review this transfer</a></p>'
        f"<p>If you weren't expecting this, you can ignore this email — nothing "
        f"changes until you accept.</p>"
    )
    return (
        f"{source_name} wants to transfer {project_name} to you",
        email_shell("Project transfer request", body),
    )
