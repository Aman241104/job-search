from agents.review import cards_from_sources


def test_review_cards_schedule_and_streak(tracker, test_user):
    tracker.add_story(test_user, "API timed out under load", "Fix it", "Added caching", "p95 down 70%",
                      "Measure first", ["performance"])
    packs = [{"job_id": "j1", "title": "Frontend Dev", "company": "Acme",
              "pack": {"likely_questions": [{"question": "What is a closure?", "answer_outline": "Function + scope"}]}}]
    cards = cards_from_sources(tracker.get_stories(test_user), packs)
    assert tracker.sync_review_cards(test_user, cards) == 2
    assert tracker.sync_review_cards(test_user, cards) == 2          # re-sync doesn't duplicate

    due = tracker.due_review_cards(test_user)
    assert due["due"] == 2 and {c["deck"] for c in due["cards"]} == {"STAR stories", "Acme · Frontend Dev"}

    first = due["cards"][0]["id"]
    assert tracker.grade_review_card(test_user, first, "good")["interval_days"] == 1
    assert tracker.due_review_cards(test_user)["due"] == 1
    assert tracker.grade_review_card(test_user, "nope", "good") is None

    today = list(tracker.activity_by_day(test_user).values())
    assert today == [{"review": 1}]
