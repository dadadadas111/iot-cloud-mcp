"""Unit tests for _try_split / _SPLIT_RE (Fix A regression).

The regex was changed from splitting on any of `.?!\n;:` to splitting on
`?!\n;` always, and on `.` only when followed by whitespace or end-of-string.
These tests lock that contract in.
"""
from __future__ import annotations

import pytest

from src.services.runtime import _try_split


def test_split_two_plain_sentences() -> None:
    """'Hello world. How are you?' splits into two sentences with no residual."""
    sentences, residual = _try_split("Hello world. How are you?")
    assert sentences == ["Hello world.", "How are you?"]
    assert residual == ""


def test_no_split_mid_url() -> None:
    """A period inside a URL must NOT be treated as a sentence boundary."""
    text = "Visit https://abc.com for info."
    sentences, residual = _try_split(text)
    # The trailing period is at end-of-string: the whole string is one sentence.
    assert len(sentences) == 1
    assert "https://abc.com" in sentences[0]
    assert residual == ""


def test_no_split_mid_decimal() -> None:
    """A period between digits must NOT be treated as a sentence boundary."""
    text = "Price is 3.14 dollars."
    sentences, residual = _try_split(text)
    assert len(sentences) == 1
    assert "3.14" in sentences[0]
    assert residual == ""


def test_no_split_on_colon() -> None:
    """A colon must NOT trigger a split (it was removed from the terminator set)."""
    text = "At 10:30 we meet."
    sentences, residual = _try_split(text)
    # Single sentence; colon did not cause a premature split.
    assert len(sentences) == 1
    assert "10:30" in sentences[0]
    assert residual == ""


def test_no_terminator_returns_residual() -> None:
    """A fragment with no terminator returns an empty sentence list and the buffer as residual."""
    sentences, residual = _try_split("Hello")
    assert sentences == []
    assert residual == "Hello"


def test_split_period_then_exclamation() -> None:
    """'Yes. No!' splits cleanly into two sentences."""
    sentences, residual = _try_split("Yes. No!")
    assert sentences == ["Yes.", "No!"]
    assert residual == ""


def test_split_question_newline_period_eos() -> None:
    """'What? Ok\\nDone.' splits on ?, \\n, and trailing . (end-of-string)."""
    sentences, residual = _try_split("What? Ok\nDone.")
    assert sentences == ["What?", "Ok", "Done."]
    assert residual == ""
