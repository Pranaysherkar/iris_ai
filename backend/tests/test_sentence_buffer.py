"""Tests for speech sentence buffering."""

from app.services.speech.sentence_buffer import flush_remainder, flush_sentence, sentence_complete


def test_sentence_complete_requires_punctuation_and_length():
    assert not sentence_complete("Hello there")
    assert sentence_complete("Hello there friend.")


def test_flush_sentence_returns_completed_and_clears_buffer():
    completed, remaining = flush_sentence("It is sunny today.")
    assert completed == "It is sunny today."
    assert remaining == ""


def test_flush_remainder_short_text():
    assert flush_remainder("Hi") is None
    assert flush_remainder("Sure thing") == "Sure thing"


def test_flush_sentence_splits_long_phrase_without_punctuation():
    long_phrase = (
        "Here is a simple HTML code for Hello World and I hope this explains it well enough"
    )
    completed, remaining = flush_sentence(long_phrase, min_chars=8, max_chars=40)
    assert completed is not None
    assert completed.endswith(".")
    assert remaining
