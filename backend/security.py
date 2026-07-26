import os
from cryptography.fernet import Fernet

# Save the encryption key in the backend directory in a hidden file
KEY_FILE = os.path.join(os.path.dirname(__file__), ".secret.key")

# Process-stable in-memory key fallback for read-only environments
_in_memory_key = None

def get_cipher() -> Fernet:
    """Loads or generates the encryption key to initialize the Fernet cipher."""
    global _in_memory_key
    
    # 1. Check if SECRET_KEY is provided in Environment Variables (optional, for prod)
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        try:
            return Fernet(env_key.encode("utf-8"))
        except Exception:
            pass
            
    # 2. Try loading from .secret.key file if it exists
    if os.path.exists(KEY_FILE):
        try:
            with open(KEY_FILE, "rb") as f:
                key = f.read()
            return Fernet(key)
        except Exception:
            pass
            
    # 3. If file doesn't exist, try generating and writing it
    try:
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as f:
            f.write(key)
        return Fernet(key)
    except (PermissionError, OSError):
        # 4. Fallback for read-only filesystems (like Vercel)
        if _in_memory_key is None:
            _in_memory_key = Fernet.generate_key()
        return Fernet(_in_memory_key)

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
