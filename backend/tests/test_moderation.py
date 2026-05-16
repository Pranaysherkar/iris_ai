"""Moderation fail-open behavior."""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.services.moderation import moderate_user_input


class ModerationFailOpenTests(unittest.IsolatedAsyncioTestCase):
    async def test_429_fail_open_does_not_raise(self):
        response = MagicMock()
        response.status_code = 429
        err = httpx.HTTPStatusError(
            "Too Many Requests",
            request=MagicMock(),
            response=response,
        )

        with (
            patch("app.services.moderation.settings") as mock_settings,
            patch("app.services.moderation.httpx.AsyncClient") as mock_client_cls,
        ):
            mock_settings.CHAT_MODERATION_ENABLED = True
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.CHAT_MODERATION_MODEL = "omni-moderation-latest"
            mock_settings.CHAT_MODERATION_FAIL_OPEN = True

            mock_response = MagicMock()
            mock_response.raise_for_status.side_effect = err

            mock_client = AsyncMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value = mock_client

            await moderate_user_input("hey")

    async def test_flagged_still_raises(self):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"results": [{"flagged": True}]}

        with (
            patch("app.services.moderation.settings") as mock_settings,
            patch("app.services.moderation.httpx.AsyncClient") as mock_client_cls,
        ):
            mock_settings.CHAT_MODERATION_ENABLED = True
            mock_settings.OPENAI_API_KEY = "test-key"
            mock_settings.CHAT_MODERATION_MODEL = "omni-moderation-latest"
            mock_settings.CHAT_MODERATION_FAIL_OPEN = True

            mock_client = AsyncMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value = mock_client

            from fastapi import HTTPException

            with self.assertRaises(HTTPException) as ctx:
                await moderate_user_input("bad content")
            self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
