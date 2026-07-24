from agents.tracker import encrypt_secret, decrypt_secret


def test_roundtrip():
    ciphertext = encrypt_secret("my-gmail-app-password")
    assert ciphertext != "my-gmail-app-password"  # must not store plaintext
    assert decrypt_secret(ciphertext) == "my-gmail-app-password"


def test_empty_string_passthrough():
    assert encrypt_secret("") == ""
    assert decrypt_secret("") == ""


def test_garbage_ciphertext_degrades_to_empty_not_raise():
    # A corrupted value or a pre-encryption-era plaintext value must not
    # crash a caller (e.g. an email-send attempt) — it should read as
    # "not configured" instead.
    assert decrypt_secret("not-a-real-fernet-token") == ""


def test_different_plaintexts_produce_different_ciphertexts():
    a = encrypt_secret("password-one")
    b = encrypt_secret("password-two")
    assert a != b
