"""Authentication: eligibility, email OTP / magic link, Google OAuth, JWT."""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from db import get_session
from email_cache import (
    email_is_eligible,
    maybe_refresh_on_miss,
    normalize_email,
)
from mail import send_email
from models import LoginOtp, User
from ticket_tailor import TicketTailorClient

logger = logging.getLogger("ecc.auth")

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def get_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TicketTailorClient:
    return TicketTailorClient(settings)


def is_google_email(email: str) -> bool:
    domain = normalize_email(email).rsplit("@", 1)[-1]
    return domain in ("gmail.com", "googlemail.com")


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_access_token(user: User, settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_ttl_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


async def get_optional_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User | None:
    auth = request.headers.get("Authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        payload = decode_access_token(token, settings)
    except HTTPException:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    try:
        uid = uuid.UUID(str(user_id))
    except ValueError:
        return None
    result = await session.execute(select(User).where(User.id == uid))
    return result.scalar_one_or_none()


async def require_user(
    user: Annotated[User | None, Depends(get_optional_user)],
) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


async def ensure_eligible(
    session: AsyncSession,
    client: TicketTailorClient,
    email: str,
) -> str:
    normalized = normalize_email(email)
    if not normalized or "@" not in normalized:
        raise HTTPException(status_code=400, detail="Invalid email")
    if await email_is_eligible(session, normalized):
        return normalized
    refreshed = await maybe_refresh_on_miss(client)
    if refreshed and await email_is_eligible(session, normalized):
        return normalized
    raise HTTPException(
        status_code=403,
        detail="Only people who have bought a ticket can sign in",
    )


async def get_or_create_user(
    session: AsyncSession,
    email: str,
    *,
    google_sub: str | None = None,
) -> User:
    normalized = normalize_email(email)
    result = await session.execute(select(User).where(User.email == normalized))
    user = result.scalar_one_or_none()
    if user:
        if google_sub and not user.google_sub:
            user.google_sub = google_sub
            await session.commit()
            await session.refresh(user)
        return user
    user = User(email=normalized, google_sub=google_sub)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


class EmailBody(BaseModel):
    email: EmailStr


class CheckEmailResponse(BaseModel):
    allowed: bool
    method: str | None = None
    code_allowed: bool = False


class VerifyEmailBody(BaseModel):
    email: EmailStr | None = None
    code: str | None = None
    token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


class MeResponse(BaseModel):
    id: str
    email: str
    google_linked: bool


@router.post("/check-email", response_model=CheckEmailResponse)
async def check_email(
    body: EmailBody,
    session: Annotated[AsyncSession, Depends(get_session)],
    client: Annotated[TicketTailorClient, Depends(get_client)],
) -> CheckEmailResponse:
    try:
        email = await ensure_eligible(session, client, str(body.email))
    except HTTPException as exc:
        if exc.status_code == 403:
            return CheckEmailResponse(allowed=False)
        raise
    if is_google_email(email):
        return CheckEmailResponse(
            allowed=True, method="google", code_allowed=True
        )
    return CheckEmailResponse(allowed=True, method="email", code_allowed=True)


def _send_login_email(
    settings: Settings, *, to: str, code: str, magic_url: str
) -> None:
    text = (
        f"Your login code is {code}.\n\n"
        f"Or open this link to sign in:\n{magic_url}\n\n"
        "This code expires in 10 minutes."
    )
    html_body = (
        f"<p>Your login code is <strong>{code}</strong>.</p>"
        f'<p><a href="{magic_url}">Sign in with this link</a></p>'
        "<p>This code expires in 10 minutes.</p>"
    )
    send_email(
        settings,
        to=[to],
        subject="Your Eugene Cuddle Club login code",
        text=text,
        html_body=html_body,
        unset_key_log=f"Dev login code for {to}: {code} (link: {magic_url})",
    )


@router.post("/email/start")
async def email_start(
    body: EmailBody,
    session: Annotated[AsyncSession, Depends(get_session)],
    client: Annotated[TicketTailorClient, Depends(get_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    email = await ensure_eligible(session, client, str(body.email))
    code = f"{secrets.randbelow(1_000_000):06d}"
    magic = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(
        seconds=settings.otp_ttl_seconds
    )

    await session.execute(delete(LoginOtp).where(LoginOtp.email == email))
    session.add(
        LoginOtp(
            email=email,
            code_hash=hash_secret(code),
            magic_token_hash=hash_secret(magic),
            expires_at=expires,
        )
    )
    await session.commit()

    magic_url = f"{settings.site_url.rstrip('/')}/login/?token={magic}"
    try:
        _send_login_email(settings, to=email, code=code, magic_url=magic_url)
    except Exception:
        logger.exception("Failed to send login email to %s", email)
        raise HTTPException(status_code=502, detail="Could not send login email")

    return {"status": "sent"}


@router.post("/email/verify", response_model=TokenResponse)
async def email_verify(
    body: VerifyEmailBody,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    now = datetime.now(timezone.utc)

    if body.token:
        token_hash = hash_secret(body.token.strip())
        result = await session.execute(
            select(LoginOtp)
            .where(LoginOtp.magic_token_hash == token_hash)
            .order_by(LoginOtp.created_at.desc())
        )
        otp = result.scalars().first()
        if not otp or otp.expires_at < now:
            raise HTTPException(status_code=400, detail="Invalid or expired link")
        email = otp.email
        await session.execute(delete(LoginOtp).where(LoginOtp.email == email))
        await session.commit()
    elif body.email and body.code:
        email = normalize_email(str(body.email))
        code = body.code.strip().replace(" ", "")
        result = await session.execute(
            select(LoginOtp)
            .where(LoginOtp.email == email)
            .order_by(LoginOtp.created_at.desc())
        )
        otp = result.scalars().first()
        if (
            not otp
            or otp.expires_at < now
            or otp.code_hash != hash_secret(code)
        ):
            raise HTTPException(status_code=400, detail="Invalid or expired code")
        await session.execute(delete(LoginOtp).where(LoginOtp.email == email))
        await session.commit()
    else:
        raise HTTPException(status_code=400, detail="Provide email+code or token")

    user = await get_or_create_user(session, email)
    token = create_access_token(user, settings)
    return TokenResponse(access_token=token, email=user.email)


def _google_state_token(email: str, settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "email": normalize_email(email),
            "nonce": secrets.token_urlsafe(8),
            "exp": int((now + timedelta(minutes=15)).timestamp()),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def _decode_google_state(state: str, settings: Settings) -> str:
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from exc
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    return normalize_email(str(email))


@router.get("/google/start")
async def google_start(
    session: Annotated[AsyncSession, Depends(get_session)],
    client: Annotated[TicketTailorClient, Depends(get_client)],
    settings: Annotated[Settings, Depends(get_settings)],
    email: Annotated[str, Query(...)],
) -> RedirectResponse:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    eligible = await ensure_eligible(session, client, email)
    if not is_google_email(eligible):
        raise HTTPException(
            status_code=400,
            detail="Google sign-in is only for Gmail addresses",
        )
    state = _google_state_token(eligible, settings)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "login_hint": eligible,
        "prompt": "select_account",
    }
    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url, status_code=302)


@router.get("/google/callback")
async def google_callback(
    session: Annotated[AsyncSession, Depends(get_session)],
    client: Annotated[TicketTailorClient, Depends(get_client)],
    settings: Annotated[Settings, Depends(get_settings)],
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
) -> RedirectResponse:
    site_login = f"{settings.site_url.rstrip('/')}/login/"
    if error:
        return RedirectResponse(f"{site_login}?error=google", status_code=302)
    if not code or not state:
        return RedirectResponse(f"{site_login}?error=google", status_code=302)

    expected_email = _decode_google_state(state, settings)
    await ensure_eligible(session, client, expected_email)

    async with httpx.AsyncClient(timeout=30.0) as http:
        token_resp = await http.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code >= 400:
            logger.error("Google token exchange failed: %s", token_resp.text[:300])
            return RedirectResponse(f"{site_login}?error=google", status_code=302)
        access = token_resp.json().get("access_token")
        if not access:
            return RedirectResponse(f"{site_login}?error=google", status_code=302)

        info_resp = await http.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access}"},
        )
        if info_resp.status_code >= 400:
            return RedirectResponse(f"{site_login}?error=google", status_code=302)
        info = info_resp.json()

    google_email = normalize_email(str(info.get("email") or ""))
    google_sub = str(info.get("sub") or "") or None
    if not google_email or google_email != expected_email:
        return RedirectResponse(f"{site_login}?error=email_mismatch", status_code=302)
    if not info.get("email_verified", True):
        return RedirectResponse(f"{site_login}?error=google", status_code=302)

    user = await get_or_create_user(session, google_email, google_sub=google_sub)
    token = create_access_token(user, settings)
    return RedirectResponse(
        f"{site_login}?access_token={token}",
        status_code=302,
    )


@router.get("/me", response_model=MeResponse)
async def me(user: Annotated[User, Depends(require_user)]) -> MeResponse:
    return MeResponse(
        id=str(user.id),
        email=user.email,
        google_linked=bool(user.google_sub),
    )


@router.delete("/me")
async def delete_me(
    user: Annotated[User, Depends(require_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await session.execute(delete(LoginOtp).where(LoginOtp.email == user.email))
    await session.execute(delete(User).where(User.id == user.id))
    await session.commit()
    return {"status": "deleted"}


@router.post("/logout")
async def logout() -> dict[str, str]:
    return {"status": "ok"}
