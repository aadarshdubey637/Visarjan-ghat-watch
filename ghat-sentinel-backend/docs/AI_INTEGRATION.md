# AI integration (Claude)

AI is optional and only **explains** evidence the backend has already retrieved and calculated. It never measures,
sets thresholds or scores risk.

## Configuration

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic API key (server-side only; never sent to the browser or logged) |
| `ANTHROPIC_MODEL` | a model ID enabled for your key, for example a Haiku model (cheap, fast) or a Sonnet model. Not hardcoded. |
| `AI_TIMEOUT_SECONDS` | per-request timeout, default 20 |
| `AI_RATE_LIMIT_PER_MINUTE` | per-IP limit on the AI routes, default 20 |

If either key or model is missing the app runs deterministic-only. The client is the official `anthropic` Python SDK;
the code never sends sampling parameters (`temperature` etc.), which newer models reject, and allows 4,096 output
tokens so models that reason first still have room for the visible answer.

## Flow (`app/services/briefs.py`, `citizen.py`, `ai.py`)

1. Validate the request (ghat IDs, language, question length 3-500).
2. Retrieve readings and run the criteria and priority engines.
3. Build a bounded **evidence pack** (observations, calculations, guidance, resources), each item with a stable ID
   (a reading ID, or `calc:`, `guide:`, `res:` prefixed).
4. Render the deterministic template text (always available).
5. If `use_ai` is true and AI is configured, send only `{task, language, question, evidence[{id,type,text}]}` to Claude
   with a system prompt that forbids inventing numbers, thresholds, URLs, helplines, orders or health claims and requires
   JSON `{answerable, content, cited_ids}`.
6. **Validate** the reply (`parse_and_validate`): valid JSON; every `cited_id` is in the supplied evidence; it cites
   at least one item unless `answerable` is false; every number in the text appears in the evidence (integers up to 10
   are allowed for list numbering; Devanagari digits are normalised first); every URL appears in the evidence;
   length limits.
7. Valid -> `generation_mode: "ai"`. Anything else -> template text, `generation_mode: "template"`, with an `ai_status`
   explaining why (not configured, timeout, upstream error, refusal, failed validation).

## Failure behaviour

| Situation | `require_ai: false` (default) | `require_ai: true` |
|---|---|---|
| No key/model | 200, template | 503 `AI_NOT_CONFIGURED` |
| Timeout | 200, template | 503 `AI_TIMEOUT` |
| Network / HTTP error | 200, template | 503 `AI_UPSTREAM_ERROR` |
| Refusal / cut-off / empty | 200, template | 503 `AI_REFUSED` / `AI_BAD_RESPONSE` |
| Fails evidence validation | 200, template | 503 `AI_INVALID_OUTPUT` |
| Rate limit exceeded | 429 `RATE_LIMITED` | 429 `RATE_LIMITED` |

Error messages never contain the key or upstream response bodies. All deterministic endpoints keep working when AI is
down.

## Status of testing

The AI path is covered by mocked tests (`tests/test_ai.py`: validation rules, SDK errors, refusal, truncation,
fallback, `require_ai`, rate limit). It has **not** been run against the live Claude API in this repository because
no key was available; do a smoke test after setting `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`:

```bash
curl -s localhost:8000/api/v1/brief/generate -H 'content-type: application/json' \
  -d '{"language":"en","require_ai":true}' | python -m json.tool | head
```

Because the validator is strict, a model that paraphrases numbers (for example "about 5") or cites nothing will fall
back to the template; check `ai_status` to tune the prompt or choose a different model.
