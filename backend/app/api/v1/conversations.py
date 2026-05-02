from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.v1.deps import get_current_user_id
from app.repositories.chat_repository import chat_repository

router = APIRouter()


class ConversationListItem(BaseModel):
    id: str
    title: Optional[str] = None
    updated_at: Optional[str] = None
    last_message_at: Optional[str] = None
    created_at: str


class ConversationListResponse(BaseModel):
    conversations: List[ConversationListItem]


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    user_id: Annotated[str, Depends(get_current_user_id)],
    limit: int = Query(default=200, ge=1, le=500),
):
    rows = chat_repository.list_user_conversations(user_id, limit=limit)
    items = [
        ConversationListItem(
            id=str(row["id"]),
            title=row.get("title"),
            updated_at=row.get("updated_at"),
            last_message_at=row.get("last_message_at"),
            created_at=str(row["created_at"]),
        )
        for row in rows
    ]
    return ConversationListResponse(conversations=items)


@router.delete("/conversations/{conversation_id}", status_code=204)
async def soft_delete_conversation(
    conversation_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
):
    chat_repository.soft_delete_conversation(conversation_id, user_id)
