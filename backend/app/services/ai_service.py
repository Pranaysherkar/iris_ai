import json
import re
from typing import AsyncGenerator, Dict, List, Optional

from llama_index.core.base.llms.types import ChatMessage, ChatResponse, MessageRole
from llama_index.llms.groq import Groq

from app.core.config import settings
from app.core.text_normalize import normalize_text


class AIService:
    def __init__(self):
        # Initialize Groq by default as requested
        self.llm = Groq(
            model=settings.GROQ_MODEL,
            api_key=settings.GROQ_API_KEY,
            temperature=settings.AI_TEMPERATURE,
            max_tokens=settings.AI_MAX_TOKENS,
            top_p=settings.AI_TOP_P,
            timeout=float(settings.GROQ_HTTP_TIMEOUT_SECONDS),
        )

    @staticmethod
    def _to_llamaindex_messages(messages: List[Dict[str, str]]) -> List[ChatMessage]:
        role_map = {
            "system": MessageRole.SYSTEM,
            "user": MessageRole.USER,
            "assistant": MessageRole.ASSISTANT,
        }
        converted_messages: List[ChatMessage] = []

        for message in messages:
            role_str = str(message.get("role", "user")).lower()
            content = str(message.get("content", "")).strip()
            if not content:
                continue

            converted_messages.append(
                ChatMessage(
                    role=role_map.get(role_str, MessageRole.USER),
                    content=content,
                )
            )

        return converted_messages

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        usage_holder: Optional[dict] = None,
        *,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Handles streaming chat responses from the LLM.
        If usage_holder is provided, it is updated with the latest prompt_tokens /
        completion_tokens from the provider when present (often the final chunk).
        """
        try:
            llama_messages = self._to_llamaindex_messages(messages)
            if not llama_messages:
                yield f"data: {json.dumps({'error': 'No valid messages provided'})}\n\n"
                yield "data: [DONE]\n\n"
                return

            stream_kwargs: dict = {}
            if max_tokens is not None:
                stream_kwargs["max_tokens"] = max_tokens
            if temperature is not None:
                stream_kwargs["temperature"] = temperature

            llm = self.llm
            if model and model != settings.GROQ_MODEL:
                llm = Groq(
                    model=model,
                    api_key=settings.GROQ_API_KEY,
                    temperature=temperature if temperature is not None else settings.AI_TEMPERATURE,
                    max_tokens=max_tokens if max_tokens is not None else settings.AI_MAX_TOKENS,
                    top_p=settings.AI_TOP_P,
                    timeout=float(settings.GROQ_HTTP_TIMEOUT_SECONDS),
                )

            response_gen = await llm.astream_chat(llama_messages, **stream_kwargs)

            async for chunk in response_gen:
                if usage_holder is not None and getattr(chunk, "additional_kwargs", None):
                    ak = chunk.additional_kwargs
                    pt = ak.get("prompt_tokens")
                    ct = ak.get("completion_tokens")
                    if pt is not None:
                        usage_holder["prompt_tokens"] = int(pt)
                    if ct is not None:
                        usage_holder["completion_tokens"] = int(ct)

                if chunk.delta:
                    yield f"data: {json.dumps({'text': chunk.delta})}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    @staticmethod
    def _text_from_chat_response(response: ChatResponse) -> str:
        msg = response.message
        raw = getattr(msg, "content", None)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        blocks = getattr(msg, "blocks", None)
        if blocks:
            parts: List[str] = []
            for block in blocks:
                text = getattr(block, "text", None)
                if text:
                    parts.append(str(text))
            if parts:
                return " ".join(parts).strip()
        return str(msg).strip()

    @staticmethod
    def _sanitize_title(raw: str, max_words: int) -> str:
        t = normalize_text(raw)
        if not t:
            return ""
        t = t.split("\n")[0].strip()
        t = t.strip(" \"'“”")
        t = re.sub(r"^[.#\-*]+\s*", "", t)
        words = t.split()
        if len(words) > max_words:
            words = words[:max_words]
        return " ".join(words)

    async def generate_conversation_title(
        self,
        user_message: str,
        assistant_message: str,
        *,
        max_words: int,
        strict_retry: bool = False,
    ) -> Optional[str]:
        """
        One-shot title after the chosen user + assistant exchange.
        """
        u = (user_message or "").strip()[:4000]
        a = (assistant_message or "").strip()[:4000]
        if not u or not a:
            return None

        mw = max(1, min(int(max_words), 12))

        ban_block = ""
        user_prefix = ""
        if strict_retry:
            ban_block = (
                " BANNED in the reply: Introduction, Introducing, Assistant, Greeting, "
                "Conversation, Chatting, Hello, Welcome, Meta, Dialogue. Only the noun phrase topic."
            )
            user_prefix = "User question (prioritize ONLY this):\n"

        base_system = (
            f"You generate chat sidebar titles only. Reply with at most {mw} WORDS describing what the USER needs help with. "
            "Use noun phrases — like book chapter titles — not sentences. Describe the TASK or KNOWLEDGE topic "
            '(e.g. "MCA Career Options", "Docker Compose Networking", not "Talking with AI"). '
            "No quotes, markdown, commas at end, apologies, pronouns referring to bots."
            f"{ban_block}"
        )

        user_body = (
            f"{user_prefix}"
            "Context (use BOTH; user wins on intent):\n\n"
            f"User:\n{u}\n\nAssistant (brief context only):\n{a[:2200]}\n\nSidebar title:"
        )

        system = ChatMessage(role=MessageRole.SYSTEM, content=base_system)
        user = ChatMessage(role=MessageRole.USER, content=user_body)

        try:
            resp = await self.llm.achat(
                [system, user],
                temperature=0.15 if strict_retry else 0.2,
                max_tokens=28 if strict_retry else 32,
            )
            raw = self._text_from_chat_response(resp)
            title = self._sanitize_title(raw, mw)
            return title or None
        except Exception:
            return None


# Singleton instance
ai_service = AIService()
