def test_allows_up_to_max_calls_then_blocks(tracker, test_user):
    action = "pytest_action"
    assert tracker.check_rate_limit(test_user, action, max_calls=2, window_seconds=60) is True
    assert tracker.check_rate_limit(test_user, action, max_calls=2, window_seconds=60) is True
    assert tracker.check_rate_limit(test_user, action, max_calls=2, window_seconds=60) is False


def test_different_actions_have_independent_limits(tracker, test_user):
    assert tracker.check_rate_limit(test_user, "action_a", max_calls=1, window_seconds=60) is True
    assert tracker.check_rate_limit(test_user, "action_a", max_calls=1, window_seconds=60) is False
    # action_b's own limit is untouched by action_a's usage
    assert tracker.check_rate_limit(test_user, "action_b", max_calls=1, window_seconds=60) is True


def test_different_users_have_independent_limits(tracker, test_user):
    other_user = tracker.get_or_create_user(
        google_sub="pytest-other-user", email="pytest-other@example.com", name="Other", avatar_url=""
    )
    try:
        action = "shared_action_name"
        assert tracker.check_rate_limit(test_user, action, max_calls=1, window_seconds=60) is True
        assert tracker.check_rate_limit(test_user, action, max_calls=1, window_seconds=60) is False
        assert tracker.check_rate_limit(other_user, action, max_calls=1, window_seconds=60) is True
    finally:
        tracker.delete_account(other_user)
