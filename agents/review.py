"""Spaced-repetition review over the user's own interview material.

Cards come from the STAR story bank and from each job's interview prep pack,
so there's nothing to write by hand: recall practice for exactly what the
next interview will ask.
"""
import json
from datetime import date, timedelta

GRADES = {"again": 1, "hard": 3, "good": 4, "easy": 5}   # SM-2 quality


def sm2(ease: float, interval: int, reps: int, grade: str) -> tuple[float, int, int]:
    """Next (ease, interval_days, reps). interval 0 = see it again this session.
    ponytail: classic SM-2; swap in py-fsrs if retention tuning ever matters."""
    q = GRADES[grade]
    ease = max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    if q < 3:
        return ease, 0, 0
    reps += 1
    interval = 1 if reps == 1 else 6 if reps == 2 else round(interval * ease)
    if grade == "easy":
        interval = round(interval * 1.3)
    return ease, interval, reps


def cards_from_sources(stories: list, prep_packs: list) -> list[dict]:
    """prep_packs: [{"job_id", "title", "company", "pack": {...}}]."""
    cards = []
    for s in stories:
        cue = ", ".join(s.get("tags") or []) or (s.get("situation") or "")[:120]
        back = "\n\n".join(f"{k.upper()}: {s[k]}" for k in ("situation", "task", "action", "result", "reflection") if s.get(k))
        cards.append({"source_ref": f"story:{s['id']}", "deck": "STAR stories",
                      "front": f"Tell me about a time... ({cue})", "back": back})
    for p in prep_packs:
        pack = p["pack"] if isinstance(p["pack"], dict) else json.loads(p["pack"] or "{}")
        for i, q in enumerate(pack.get("likely_questions") or []):
            if q.get("question") and q.get("answer_outline"):
                cards.append({"source_ref": f"prep:{p['job_id']}:{i}", "deck": f"{p['company']} · {p['title']}"[:80],
                              "front": q["question"], "back": q["answer_outline"]})
    return cards


POINTS = {"apply": 5, "train": 1, "review": 1}
DEFAULT_GOAL = 10


def day_points(kinds: dict) -> int:
    return sum(POINTS.get(k, 0) * n for k, n in (kinds or {}).items())


def streak(activity: dict, goal: int, today: date) -> dict:
    """activity: {"YYYY-MM-DD": {kind: count}}. A missed day is bridged by a
    freeze, at most one per 7 days walked (Duolingo's streak freeze). Today
    only counts once it's met, so the streak isn't 'broken' mid-day."""
    met = lambda d: day_points(activity.get(d.isoformat())) >= goal   # noqa: E731
    day = today if met(today) else today - timedelta(days=1)
    count, frozen, since_freeze = 0, [], 7
    while (today - day).days <= 365:
        if met(day):
            count += 1
            since_freeze += 1
        elif since_freeze >= 7 and met(day - timedelta(days=1)):
            frozen.append(day.isoformat())
            since_freeze = 0
        else:
            break
        day -= timedelta(days=1)
    pts = day_points(activity.get(today.isoformat()))
    return {"streak": count, "today_points": pts, "goal": goal, "met_today": pts >= goal, "frozen_days": frozen}


if __name__ == "__main__":
    t = date(2026, 10, 21)
    d = lambda n: (t - timedelta(days=n)).isoformat()   # noqa: E731
    assert streak({}, 10, t)["streak"] == 0
    assert streak({d(0): {"apply": 2}}, 10, t)["streak"] == 1
    # today not met yet -> yesterday's run still stands
    assert streak({d(1): {"review": 10}, d(2): {"apply": 2}}, 10, t)["streak"] == 2
    # one missed day (d2) is frozen, two in a row break it
    s = streak({d(0): {"apply": 2}, d(1): {"apply": 2}, d(3): {"apply": 2}}, 10, t)
    assert s["streak"] == 3 and s["frozen_days"] == [d(2)]
    assert streak({d(0): {"apply": 2}, d(3): {"apply": 2}}, 10, t)["streak"] == 1
    assert streak({d(0): {"train": 3}}, 10, t)["met_today"] is False
    assert sm2(2.5, 0, 0, "good") == (2.5, 1, 1)
    assert sm2(2.5, 1, 1, "good") == (2.5, 6, 2)
    assert sm2(2.5, 6, 2, "good")[1] == 15
    assert sm2(2.5, 6, 2, "again")[1:] == (0, 0)
    assert sm2(2.5, 6, 2, "easy")[1] > sm2(2.5, 6, 2, "good")[1]
    assert sm2(1.3, 6, 2, "hard")[0] == 1.3
    print("ok")
