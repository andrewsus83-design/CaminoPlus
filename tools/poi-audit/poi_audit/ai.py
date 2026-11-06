"""Optional Claude steps: description drafts and photo plausibility.

Only runs with ``--ai`` and an ``ANTHROPIC_API_KEY``. Everything Claude
produces here is a *draft for a human*: descriptions are written only from the
source text we pass in (Wikidata + Wikipedia summary), and the photo check is
"does this plausibly show X?", never proof.
"""
from __future__ import annotations

import json
import os
from urllib.parse import quote, unquote

from .conflate import Entity
from .sources import Cache, _retry, _session

MODEL = os.environ.get("CAMINOPLUS_AI_MODEL", "claude-sonnet-5-5")

DESCRIPTION_SCHEMA = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "facts_used": {"type": "array", "items": {"type": "string"}},
        "unsure": {"type": "array", "items": {"type": "string"}},
        "enough_sources": {"type": "boolean"},
    },
    "required": ["description", "facts_used", "unsure", "enough_sources"],
    "additionalProperties": False,
}

PHOTO_SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["matches", "does_not_match", "unsure"]},
        "shows": {"type": "string"},
        "reason": {"type": "string"},
    },
    "required": ["verdict", "shows", "reason"],
    "additionalProperties": False,
}


def available() -> bool:
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _client():
    import anthropic
    return anthropic.Anthropic()


def _ask(content: list, schema: dict) -> dict | None:
    resp = _client().beta.messages.create(
        model=MODEL,
        max_tokens=4000,
        betas=["server-side-fallback-2026-07-01"],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        fallbacks="default",
        messages=[{"role": "user", "content": content}],
    )
    if resp.stop_reason == "refusal":
        return None
    text = next((b.text for b in resp.content if b.type == "text"), None)
    return json.loads(text) if text else None


def wikipedia_summary(cache: Cache, article_url: str | None) -> dict | None:
    if not article_url:
        return None
    host, title = article_url.split("/wiki/", 1)
    url = f"{host}/api/rest_v1/page/summary/{quote(unquote(title), safe='')}"

    def go():
        r = _session().get(url, timeout=30)
        if r.status_code == 404:
            return {}
        r.raise_for_status()
        return r.json()

    data = cache.get_or_fetch("wikipedia", url, lambda: _retry(go))
    if not data or not data.get("extract"):
        return None
    return {"url": article_url, "title": data.get("title"), "extract": data["extract"]}


def draft_description(cache: Cache, e: Entity) -> dict | None:
    wd = (e.by_source("wikidata") or [None])[0]
    if not wd:
        return None
    sources = [f"Wikidata {wd.source_id}: {wd.name} - {wd.tags.get('description') or ''}. "
               f"Types: {', '.join(wd.tags.get('instances') or [])}."]
    cites = [f"https://www.wikidata.org/wiki/{wd.source_id}"]
    for key in ("enwiki", "eswiki"):
        s = wikipedia_summary(cache, wd.tags.get(key))
        if s:
            sources.append(f"Wikipedia ({s['url']}): {s['extract']}")
            cites.append(s["url"])
            break
    prompt = (
        "You write short place descriptions for a pilgrim app. Use ONLY the facts in the sources "
        "below; do not add dates, legends, opening times or anything else from memory. Write 2 to 3 "
        "plain English sentences, in your own words (do not copy sentences). If the sources are too "
        "thin, say so via enough_sources=false and keep the description to what is certain. List in "
        "'unsure' anything a human editor should double-check.\n\n"
        f"Place: {e.name} ({e.primary.category})\n\nSources:\n" + "\n\n".join(sources)
    )
    out = _ask([{"type": "text", "text": prompt}], DESCRIPTION_SCHEMA)
    if out:
        out.update({"status": "draft_needs_review", "model": MODEL, "sources": cites})
    return out


def check_photo(e: Entity, photo: dict) -> dict | None:
    if not photo.get("thumb_url"):
        return None
    wd = (e.by_source("wikidata") or [None])[0]
    context = f"{e.name} - a {e.primary.category}"
    if wd and wd.tags.get("description"):
        context += f" ({wd.tags['description']})"
    prompt = (
        f"Does this photo plausibly show: {context}? Judge only from what is visible "
        "(building type, setting, signs). Say 'unsure' if it could be another place. "
        f"Commons file name: {photo['file']}."
    )
    out = _ask([
        {"type": "image", "source": {"type": "url", "url": photo["thumb_url"]}},
        {"type": "text", "text": prompt},
    ], PHOTO_SCHEMA)
    if out:
        out["model"] = MODEL
    return out
