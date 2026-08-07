"""Drive the full two-session demo against a running backend and report it.

    python tools/demo_run.py                       # localhost:8000
    python tools/demo_run.py --url http://host:8000 --learner alex

Plays the exact script from the deck: session 1 opens cold on 3x4, the learner
answers 7 (the additive misconception), the engine switches to visual groups
and they recover. Then a simulated browser refresh, and session 2 should open
already knowing what worked.

Prints per-call latency alongside the token numbers, because a demo that is
correct but slow still fails on stage — and latency is the thing unit tests
never notice.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

ADDITIVE_WRONG_ANSWER = 7  # 3 + 4, the misconception the demo is built on


class Client:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        self.timings: list[float] = []

    def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            method=method,
            headers={"content-type": "application/json"},
        )
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.loads(response.read())
        except urllib.error.URLError as exc:
            sys.exit(f"cannot reach {self.base}{path}: {exc}")
        elapsed = time.perf_counter() - started
        self.timings.append(elapsed)
        payload["_ms"] = elapsed * 1000
        return payload

    def get(self, path: str) -> dict:
        return self._call("GET", path)

    def post(self, path: str, body: dict | None = None) -> dict:
        return self._call("POST", path, body or {})


def play_session(client: Client, learner: str, label: str, miss_first: bool) -> dict:
    print(f"\n--- {label} " + "-" * (58 - len(label)))
    asked = 0
    tokens = 0

    while asked < 8:
        question = client.post(
            "/next-challenge", {"learner_id": learner, "quest_id": 1}
        )
        asked += 1

        note = question["memory_note"]
        chosen = (
            ADDITIVE_WRONG_ANSWER
            if miss_first and asked == 1
            else question["correct_answer"]
        )

        result = client.post(
            "/submit-answer",
            {
                "learner_id": learner,
                "quest_id": 1,
                "question_id": question["question_id"],
                "chosen_answer": chosen,
                "response_ms": 5200,
            },
        )
        tokens = result["tokens_used_session"]

        mark = "ok " if result["correct"] else "MISS"
        print(
            f"  Q{asked} {question['a']}x{question['b']:<2} "
            f"{question['format']:<7} hint={question['hint_level']} "
            f"opts={question['num_options']} {mark} "
            f"tok={result['tokens_used_this_call']:<4} "
            f"[next {question['_ms']:.0f}ms, submit {result['_ms']:.0f}ms]"
        )
        if note:
            print(f"       memory: {note}")

        if result["quest_complete"]:
            break

    return {"questions": asked, "tokens": tokens}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--learner", default="alex")
    args = parser.parse_args()

    client = Client(args.url)

    health = client.get("/health")
    print(
        f"backend: memory={health['memory_backend']} "
        f"analytics={health['analytics_sink']} facts={health['facts_loaded']}"
    )

    one = play_session(client, args.learner, "SESSION 1 (cold)", miss_first=True)

    print("\n  ...simulating the browser refresh...")
    client.post(f"/debug/new-session/{args.learner}")

    two = play_session(client, args.learner, "SESSION 2 (warm)", miss_first=False)

    summary = client.get(f"/session-summary/{args.learner}")

    print("\n=== reveal card " + "=" * 47)
    rows = [
        ("questions", one["questions"], two["questions"]),
        ("session tokens", summary["tokens_session1"], summary["tokens_session2"]),
        (
            "tokens per call",
            summary["avg_tokens_per_call_session1"],
            summary["avg_tokens_per_call_session2"],
        ),
    ]
    print(f"  {'':<18}{'session 1':>12}{'session 2':>12}")
    for name, a, b in rows:
        print(f"  {name:<18}{a:>12}{b:>12}")

    print(f"\n  per-call reduction : {summary['per_call_reduction_pct']}%")
    print(f"  session reduction  : {summary['token_reduction_pct']}%")
    print(f"  strategy retrieved : {summary['strategy_retrieved']}")
    print(f"  memory source      : {summary['memory_source']}")
    print(f"  mastery            : {summary['mastery_before']} -> {summary['mastery_after']}")
    print(f"  facts mastered     : {summary['facts_mastered']}")
    print(f"  cta                : {summary['pricing_cta']}")

    slowest = max(client.timings) * 1000
    print(f"\n  slowest call       : {slowest:.0f}ms")
    if slowest > 1500:
        print("  WARNING: a call over 1.5s will be visible on stage.")

    # These are the two claims the pitch is built on. Fail loudly, not quietly.
    problems = []
    if summary["strategy_retrieved"] == "none yet":
        problems.append("session 2 retrieved no strategy — the reveal is dead")
    if summary["per_call_reduction_pct"] <= 0:
        problems.append("no per-call token reduction — the cost claim is dead")
    if problems:
        print()
        for problem in problems:
            print(f"  FAIL: {problem}")
        sys.exit(1)

    print("\n  Demo path is intact.\n")


if __name__ == "__main__":
    main()
