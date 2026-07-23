"""Google OAuth login + session JWTs. One user = one workspace: every table
in tracker.py is scoped by the user_id issued here.

Flow: GET /auth/google/login redirects to Google -> GET /auth/google/callback
exchanges the code, upserts the user row, sets an httpOnly session cookie ->
every other endpoint depends on get_current_user to read that cookie.
"""
import time
import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import Request, HTTPException

from config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET

SESSION_COOKIE = "session"
JWT_ALGORITHM = "HS256"
SESSION_TTL_SECONDS = 30 * 24 * 3600  # 30 days

oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def issue_session_jwt(user_id: str) -> str:
    now = int(time.time())
    payload = {"sub": user_id, "iat": now, "exp": now + SESSION_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_session_jwt(token: str) -> str:
    """Returns the user_id, or raises jwt.PyJWTError if invalid/expired."""
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    return payload["sub"]


def get_current_user(request: Request) -> str:
    """FastAPI dependency — returns the current user_id or raises 401."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    try:
        return verify_session_jwt(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="invalid or expired session")


if __name__ == "__main__":
    token = issue_session_jwt("user-123")
    assert verify_session_jwt(token) == "user-123"
    try:
        jwt.decode(token, "wrong-secret-entirely", algorithms=[JWT_ALGORITHM])
        raise AssertionError("should have rejected a token signed with a different secret")
    except jwt.PyJWTError:
        pass
    print("auth self-check passed")
