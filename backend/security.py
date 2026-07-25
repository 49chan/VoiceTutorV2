import os
from cryptography.fernet import Fernet

# Save the encryption key in the backend directory in a hidden file
KEY_FILE = os.path.join(os.path.dirname(__file__), ".secret.key")

def get_cipher() -> Fernet:
    """Loads or generates the encryption key to initialize the Fernet cipher."""
    if not os.path.exists(KEY_FILE):
        # Generate new key
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as f:
            f.write(key)
    else:
        with open(KEY_FILE, "rb") as f:
            key = f.read()
    return Fernet(key)

# Global cipher cache
_cipher = None

def _get_cipher_instance() -> Fernet:
    global _cipher
    if _cipher is None:
        _cipher = get_cipher()
    return _cipher

def encrypt_value(value: str) -> str:
    """Encrypts a string and returns a base64 encoded string."""
    if not value:
        return ""
    cipher = _get_cipher_instance()
    try:
        return cipher.encrypt(value.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""

def decrypt_value(encrypted_value: str) -> str:
    """Decrypts a base64 encoded string and returns the original string."""
    if not encrypted_value:
        return ""
    cipher = _get_cipher_instance()
    try:
        return cipher.decrypt(encrypted_value.encode("utf-8")).decode("utf-8")
    except Exception:
        # Return empty string if decryption fails (e.g., corrupt key or invalid cipher text)
        return ""
