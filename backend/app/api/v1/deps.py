from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException

from app.core.supabase import get_supabase_admin_client


def bearer_token(authorization: Annotated[Optional[str], Header()] = None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    return token


def get_current_user_id(access_token: Annotated[str, Depends(bearer_token)]) -> str:
    try:
        supabase = get_supabase_admin_client()
        user_response = supabase.auth.get_user(access_token)
        user = getattr(user_response, "user", None)
        if not user or not getattr(user, "id", None):
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return str(user.id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Token validation failed") from exc
