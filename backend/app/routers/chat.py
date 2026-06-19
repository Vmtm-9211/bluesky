import traceback

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import Role, User
from app.services.chat_service import (
    build_admin_context,
    build_user_context,
    call_gemini_chat,
)

settings = get_settings()
router = APIRouter(prefix="/chat", tags=["chat"])


class HistoryItem(BaseModel):
    role: str   # "user" | "assistant"
    text: str


class ChatRequest(BaseModel):
    message: str
    history: list[HistoryItem] = []


class ChatResponse(BaseModel):
    reply: str


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (settings.gemini_api_key or settings.google_api_key):
        return ChatResponse(
            reply="AI is not configured. Set GEMINI_API_KEY in the backend .env and restart."
        )

    context = (
        build_admin_context(current_user, db)
        if current_user.role == Role.ADMIN
        else build_user_context(current_user, db)
    )

    history = [{"role": item.role, "text": item.text} for item in payload.history]

    try:
        reply = call_gemini_chat(context, history, payload.message)
    except Exception as exc:
        full_trace = traceback.format_exc()
        print(f"[chat] Gemini error:\n{full_trace}")
        exc_str = str(exc)
        if "503" in exc_str or "UNAVAILABLE" in exc_str or "high demand" in exc_str.lower():
            reply = "The AI service is currently experiencing high demand. Please try again in a moment."
        elif "429" in exc_str or "quota" in exc_str.lower() or "rate" in exc_str.lower():
            reply = "The AI service rate limit has been reached. Please wait a moment before trying again."
        elif "401" in exc_str or "403" in exc_str or "API_KEY" in exc_str:
            reply = "AI is not configured correctly. Please contact your administrator."
        else:
            reply = "Something went wrong with the AI service. Please try again later."

    return ChatResponse(reply=reply)
