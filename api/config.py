import os
import json
from pydantic import BaseModel
from typing import Optional

# Load .env file manually into os.environ for local environments
_env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(_env_file):
    try:
        with open(_env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()
    except Exception:
        pass

try:
    from api.security import encrypt_value, decrypt_value
except ImportError:
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
    has_azure_speech: Optional[bool] = False
    has_google_sheets: Optional[bool] = False

def get_default_storage_path() -> str:
    """Gets the default directory to save assessment JSONs and audio MP3s."""
    # Check if running on Vercel or read-only filesystem
    if os.environ.get("VERCEL"):
        recordings_dir = "/tmp/tutor_doc_recordings"
    else:
        home_dir = os.path.expanduser("~")
        recordings_dir = os.path.join(home_dir, "VoiceTutor_Records")
        
    try:
        os.makedirs(recordings_dir, exist_ok=True)
    except (PermissionError, OSError):
        recordings_dir = "/tmp/tutor_doc_recordings"
        try:
            os.makedirs(recordings_dir, exist_ok=True)
        except Exception:
            pass
            
    return os.path.abspath(recordings_dir)

# In-memory settings cache to support session persistence on stateless/read-only cloud environments like Vercel
_cached_settings = None

def load_settings() -> AppSettings:
    """Loads configuration. Returns default config on failure. Credentials are only loaded from Environment Variables."""
    global _cached_settings
    if _cached_settings is not None:
        # Dynamically refresh credentials in cache in case env vars changed
        _cached_settings.azure_speech_key = os.environ.get("AZURE_SPEECH_KEY", "")
        _cached_settings.azure_speech_region = os.environ.get("AZURE_SPEECH_REGION", "")
        _cached_settings.google_vision_ocr_key = os.environ.get("GOOGLE_VISION_OCR_KEY", "")
        _cached_settings.google_sheets_webhook_url = os.environ.get("GOOGLE_SHEETS_WEBHOOK_URL", "")
        _cached_settings.google_client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
        _cached_settings.google_drive_folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")
        _cached_settings.authorized_email = os.environ.get("AUTHORIZED_EMAIL", "")
        _cached_settings.has_azure_speech = bool(_cached_settings.azure_speech_key and _cached_settings.azure_speech_region)
        _cached_settings.has_google_sheets = bool(_cached_settings.google_sheets_webhook_url)
        return _cached_settings
        
    default_path = get_default_storage_path()
    
    # 1. Initialize with defaults (Non-credentials)
    settings = AppSettings(
        local_storage_path=default_path,
        learning_language="ja-JP"
    )
    
    # 2. Load from settings.json if it exists (Only non-credential configurations)
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            storage_path = default_path
            os.makedirs(storage_path, exist_ok=True)

            settings.learning_language = data.get("learning_language", "ja-JP")
            settings.local_storage_path = storage_path
        except Exception:
            pass

    # 3. Always apply credentials exclusively from Environment Variables (Not from settings.json)
    settings.azure_speech_key = os.environ.get("AZURE_SPEECH_KEY", "")
    settings.azure_speech_region = os.environ.get("AZURE_SPEECH_REGION", "")
    settings.google_vision_ocr_key = os.environ.get("GOOGLE_VISION_OCR_KEY", "")
    settings.google_sheets_webhook_url = os.environ.get("GOOGLE_SHEETS_WEBHOOK_URL", "")
    settings.google_client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    settings.google_drive_folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "")
    settings.authorized_email = os.environ.get("AUTHORIZED_EMAIL", "")
    settings.has_azure_speech = bool(settings.azure_speech_key and settings.azure_speech_region)
    settings.has_google_sheets = bool(settings.google_sheets_webhook_url)
        
    _cached_settings = settings
    return settings

def save_settings(settings: AppSettings) -> bool:
    """Saves the non-credential configuration (language and local paths) to settings.json. Gracefully bypasses on read-only environments."""
    global _cached_settings
    settings.local_storage_path = get_default_storage_path()
    _cached_settings = settings
    try:
        storage_path = settings.local_storage_path
        
        try:
            os.makedirs(storage_path, exist_ok=True)
            
            data_to_save = {
                "learning_language": settings.learning_language,
                "local_storage_path": os.path.abspath(storage_path)
            }
            
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(data_to_save, f, ensure_ascii=False, indent=2)
            return True
        except (PermissionError, OSError) as e:
            if os.environ.get("VERCEL") or "read-only" in str(e).lower() or "[errno 30]" in str(e).lower() or "[errno 13]" in str(e).lower():
                return True
            raise e
    except Exception:
        return False
