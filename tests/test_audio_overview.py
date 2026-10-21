import agents.audio_overview as ao


def test_write_script_parses_and_cleans(monkeypatch):
    monkeypatch.setattr(ao, "ask_ai", lambda *a, **k: 'Sure!\n[{"speaker": "A", "text": " Hooks run after render. "},'
                                                      ' {"speaker": "X", "text": "Why?"}, {"speaker": "B", "text": ""}]')
    assert ao.write_script("Hooks", ["notes"]) == [
        {"speaker": "A", "text": "Hooks run after render."},
        {"speaker": "A", "text": "Why?"},          # unknown speaker falls back to A; empty turn dropped
    ]


def test_write_script_handles_failure(monkeypatch):
    monkeypatch.setattr(ao, "ask_ai", lambda *a, **k: "")
    assert ao.write_script("Hooks", ["notes"]) == []
    assert ao.write_script("Hooks", [None, ""]) == []   # nothing to work from: no AI call needed
