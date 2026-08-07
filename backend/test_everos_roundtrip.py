"""EverOS round-trip smoke test (build-plan task B1.4, corrected).

Run on-site once EVEROS_API_KEY is available:
    export EVEROS_API_KEY=...
    python test_everos_roundtrip.py
"""

from __future__ import annotations

from memory import retrieve_learner_context, store_observation

LEARNER_ID = "alex_test"


def main() -> None:
    store_observation(
        LEARNER_ID,
        "Alex answered 3x4 as 7, may be treating x as +. Visual groups helped after.",
    )
    print("Stored observation. Waiting isn't needed for search per the docs, "
          "but if this comes back empty, retry once — extraction may be async.")

    hits = retrieve_learner_context(LEARNER_ID, "multiplication 3 times table")
    print(f"Retrieved {len(hits)} memory hit(s):")
    for h in hits:
        print(f"  - {h}")

    assert hits, "Expected at least one memory hit back — check API key / query."
    print("Round-trip OK.")


if __name__ == "__main__":
    main()
