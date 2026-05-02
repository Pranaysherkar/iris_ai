from llama_index.llms.groq import Groq
from llama_index.core.base.llms.types import ChatMessage, MessageRole
from app.core.config import settings
from typing import List, Dict, AsyncGenerator
import json

class AIService:
    def __init__(self):
        # Initialize Groq by default as requested
        self.llm = Groq(
            model=settings.GROQ_MODEL,
            api_key=settings.GROQ_API_KEY,
            temperature=settings.AI_TEMPERATURE,
            max_tokens=settings.AI_MAX_TOKENS,
            top_p=settings.AI_TOP_P
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

    async def chat_stream(self, messages: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
        """
        Handles streaming chat responses from the LLM.
        """
        try:
            llama_messages = self._to_llamaindex_messages(messages)
            if not llama_messages:
                yield f"data: {json.dumps({'error': 'No valid messages provided'})}\n\n"
                yield "data: [DONE]\n\n"
                return

            response_gen = await self.llm.astream_chat(llama_messages)

            async for chunk in response_gen:
                if chunk.delta:
                    yield f"data: {json.dumps({'text': chunk.delta})}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

# Singleton instance
ai_service = AIService()
