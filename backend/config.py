import os
import json
from pydantic import BaseModel
from typing import Optional

try:
    from backend.security import encrypt_value, decrypt_value
except ImportError:
    from security import encrypt_value, decrypt_value

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")

class AppSettings(BaseModel):
    azure_speech_key: Optional[str] = ""
    azure_speech_region: Optional[str] = ""
    google_vision_ocr_key: Optional[str] = ""
    google_sheets_webhook_url: Optional[str] = ""
    google_client_id: Optional[str] = ""
    google_drive_folder_id: Optional[str] = ""
    learning_language: str = "ja-JP"
    local_storage_path: Optional[str] = ""
    authorized_email: str = "yqhah@gmail.com"

def get_default_storage_path() -> str:
    """Gets the default directory to save assessment JSONs and audio MP3s."""
    parent_dir = os.path.dirname(os.path.dirname(__file__))
    recordings_dir = os.path.join(parent_dir, "recordings")
    os.makedirs(recordings_dir, exist_ok=True)
    return os.path.abspath(recordings_dir)

def load_settings() -> AppSettings:
    """Loads configuration and decrypts keys. Returns default config on failure."""
    default_path = get_default_storage_path()
    if not os.path.exists(SETTINGS_FILE):
        return AppSettings(local_storage_path=default_path)
    
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        storage_path = data.get("local_storage_path") or default_path
        os.makedirs(storage_path, exist_ok=True)

        return AppSettings(
            azure_speech_key=decrypt_value(data.get("azure_speech_key", "")),
            azure_speech_region=decrypt_value(data.get("azure_speech_region", "")),
            google_vision_ocr_key=decrypt_value(data.get("google_vision_ocr_key", "")),
            google_sheets_webhook_url=decrypt_value(data.get("google_sheets_webhook_url", "")),
            google_client_id=data.get("google_client_id", ""),
            google_drive_folder_id=decrypt_value(data.get("google_drive_folder_id", "")),
            learning_language=data.get("learning_language", "ja-JP"),
            local_storage_path=storage_path,
            authorized_email=data.get("authorized_email", "yqhah@gmail.com")
        )
    except Exception:
        return AppSettings(local_storage_path=default_path)

def save_settings(settings: AppSettings) -> bool:
    """Encrypts keys and saves the configuration to settings.json."""
    try:
        storage_path = settings.local_storage_path or get_default_storage_path()
        os.makedirs(storage_path, exist_ok=True)

        data_to_save = {
            "azure_speech_key": encrypt_value(settings.azure_speech_key),
            "azure_speech_region": encrypt_value(settings.azure_speech_region),
            "google_vision_ocr_key": encrypt_value(settings.google_vision_ocr_key),
            "google_sheets_webhook_url": encrypt_value(settings.google_sheets_webhook_url),
            "google_client_id": settings.google_client_id,
            "google_drive_folder_id": encrypt_value(settings.google_drive_folder_id),
            "learning_language": settings.learning_language,
            "local_storage_path": os.path.abspath(storage_path),
            "authorized_email": settings.authorized_email
        }
        
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False
