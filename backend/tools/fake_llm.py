"""A minimal OpenAI-compatible endpoint, so EverOS can run without a real key.

EverOS refuses to start `memorize()` unless an LLM api_key *and* base_url are
configured — `get_llm_client()` raises before any branching, so there is no
"just buffer it" path. That makes a real key a hard dependency for the memory
layer, which is not something to discover on hackathon morning.

Since EverOS speaks the OpenAI protocol against whatever `base_url` points at,
this serves that protocol locally. It answers every extraction request with an
empty JSON object: nothing is invented, EverOS's pipeline completes cleanly,
and the messages stay in its unprocessed buffer where retrieval can still find
them. That is the honest degraded mode — memory works, semantics do not.

Swap `EVEROS_LLM__BASE_URL` to a real provider and the same code path runs for
real. Nothing else changes.

    python tools/fake_llm.py            # serves on :9099
"""

from __future__ import annotations

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("FAKE_LLM_PORT", "9099"))

# EverOS's boundary detector asks "is this conversation finished, or should I
# wait for more?" before running any extraction. Answering "wait" keeps the
# messages in its unprocessed buffer, which is where retrieval finds them.
#
# This is the one honest answer a stub can give. Saying "don't wait" would send
# EverOS into extraction, where it would need a model to produce real episodes —
# and a stub inventing episodes would put fabricated claims about a learner into
# the memory the demo reads back out on stage.
BOUNDARY_WAIT = '{"should_wait": true}'


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/").endswith("/models"):
            self._send({"object": "list", "data": [{"id": "stub", "object": "model"}]})
        else:
            self._send({"status": "ok"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            request = json.loads(raw)
        except json.JSONDecodeError:
            request = {}

        if "embeddings" in self.path:
            inputs = request.get("input") or [""]
            if isinstance(inputs, str):
                inputs = [inputs]
            self._send(
                {
                    "object": "list",
                    "model": request.get("model", "stub"),
                    "data": [
                        {"object": "embedding", "index": i, "embedding": [0.0] * 1536}
                        for i, _ in enumerate(inputs)
                    ],
                    "usage": {"prompt_tokens": 0, "total_tokens": 0},
                }
            )
            return

        # Report the real prompt size — this is what makes the write cost of
        # memory measurable rather than assumed.
        prompt_chars = sum(
            len(str(m.get("content", ""))) for m in request.get("messages", [])
        )
        prompt_tokens = max(1, prompt_chars // 4)

        self._send(
            {
                "id": f"chatcmpl-stub-{int(time.time() * 1000)}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": request.get("model", "stub"),
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": BOUNDARY_WAIT},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": len(BOUNDARY_WAIT) // 4 or 1,
                    "total_tokens": prompt_tokens + 1,
                },
            }
        )

    def log_message(self, fmt: str, *args) -> None:
        print(f"[fake-llm] {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"[fake-llm] OpenAI-compatible stub on http://0.0.0.0:{PORT}/v1", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
