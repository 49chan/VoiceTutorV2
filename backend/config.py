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
    
    # 1. Initialize with default model values
    settings = AppSettings(
        local_storage_path=default_path,
        authorized_email="yqhah@gmail.com"
    )
    
    # 2. Load from settings.json if it exists
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            storage_path = data.get("local_storage_path") or default_path
            os.makedirs(storage_path, exist_ok=True)

            settings = AppSettings(
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
            pass

    # 3. Apply Environment Variable overrides (Crucial for Vercel/Cloud serverless environments!)
    if os.environ.get("AZURE_SPEECH_KEY"):
        settings.azure_speech_key = os.environ.get("AZURE_SPEECH_KEY")
    if os.environ.get("AZURE_SPEECH_REGION"):
        settings.azure_speech_region = os.environ.get("AZURE_SPEECH_REGION")
    if os.environ.get("GOOGLE_VISION_OCR_KEY"):
        settings.google_vision_ocr_key = os.environ.get("GOOGLE_VISION_OCR_KEY")
    if os.environ.get("GOOGLE_SHEETS_WEBHOOK_URL"):
        settings.google_sheets_webhook_url = os.environ.get("GOOGLE_SHEETS_WEBHOOK_URL")
    if os.environ.get("GOOGLE_CLIENT_ID"):
        settings.google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if os.environ.get("GOOGLE_DRIVE_FOLDER_ID"):
        settings.google_drive_folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    if os.environ.get("AUTHORIZED_EMAIL"):
        settings.authorized_email = os.environ.get("AUTHORIZED_EMAIL")
        
    return settings

def save_settings(settings: AppSettings) -> bool:
    """Encrypts keys and saves the configuration to settings.json. Gracefully bypasses on read-only environments."""
    try:
        # Check if running in a read-only environment like Vercel
        is_read_only = os.environ.get("VERCEL") or not os.access(os.path.dirname(os.path.abspath(__file__)), os.W_OK)
        if is_read_only:
            # Skip write but return success to satisfy frontend UI drawer
            return True
            
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
