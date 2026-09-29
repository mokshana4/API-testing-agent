"""Tiny provider-agnostic LLM client. Everything degrades gracefully when no key is set."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

try:  # optional .env support
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass

log = logging.getLogger("agent.llm")


class LLMClient:
    def __init__(self, provider: str = "none", model: str | None = None, api_key: str | None = None,
                 base_url: str | None = None, timeout: float = 90.0):
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.base_url = (base_url or "").rstrip("/")
        self.timeout = timeout
        self.calls = 0
        self.failures = 0
        self._disabled = False

    @classmethod
    def disabled(cls) -> "LLMClient":
        return cls("none")

    @classmethod
    def from_env(cls) -> "LLMClient":
        provider = os.getenv("LLM_PROVIDER", "").strip().lower()
        if not provider:
            if os.getenv("ANTHROPIC_API_KEY"):
                provider = "anthropic"
            elif os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_BASE_URL"):
                provider = "openai"
            else:
                provider = "none"
        if provider == "anthropic":
            return cls("anthropic", os.getenv("LLM_MODEL", "claude-sonnet-5"),
                       os.getenv("ANTHROPIC_API_KEY"), "https://api.anthropic.com")
        if provider == "openai":
            return cls("openai", os.getenv("LLM_MODEL", "gpt-4o-mini"), os.getenv("OPENAI_API_KEY", ""),
                       os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"))
        return cls("none")

    @property
    def enabled(self) -> bool:
        if self._disabled or self.provider == "none":
            return False
        return bool(self.api_key) or self.provider == "openai"  # local OpenAI-compatible servers need no key

    def describe(self) -> dict[str, Any]:
        return {"enabled": self.enabled or self.calls > 0, "provider": self.provider, "model": self.model,
                "calls": self.calls, "failures": self.failures}

    # ------------------------------------------------------------------ calls
    def complete(self, system: str, user: str, max_tokens: int = 4000) -> str | None:
        if not self.enabled:
            return None
        self.calls += 1
        try:
            if self.provider == "anthropic":
                r = httpx.post(
                    f"{self.base_url}/v1/messages",
                    headers={"x-api-key": self.api_key or "", "anthropic-version": "2023-06-01",
                             "content-type": "application/json"},
                    json={"model": self.model, "max_tokens": max_tokens, "system": system,
                          "messages": [{"role": "user", "content": user}]},
                    timeout=self.timeout,
                )
                r.raise_for_status()
                return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")

            headers = {"content-type": "application/json"}
            if self.api_key:
                headers["authorization"] = f"Bearer {self.api_key}"
            r = httpx.post(
                f"{self.base_url}/chat/completions", headers=headers, timeout=self.timeout,
                json={"model": self.model, "max_tokens": max_tokens, "temperature": 0.2,
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        except Exception as exc:  # network, auth, quota... never break the pipeline
            self.failures += 1
            log.warning("LLM call failed (%s): %s", self.provider, exc)
            if self.failures >= 3:
                log.warning("Disabling LLM after repeated failures; continuing rule-based.")
                self._disabled = True
            return None

    def complete_json(self, system: str, user: str, max_tokens: int = 4000) -> Any:
        text = self.complete(system, user + "\n\nRespond with valid JSON only. No prose, no markdown fences.",
                             max_tokens)
        return extract_json(text) if text else None


def extract_json(text: str) -> Any:
    """Pull the first JSON value out of an LLM reply (handles ```json fences and chatter)."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    starts = sorted((i, o, c) for o, c in (("[", "]"), ("{", "}")) if (i := text.find(o)) != -1)
    for start, _, closer in starts:
        end = text.rfind(closer)
        if end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                continue
    return None
