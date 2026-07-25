import os
import io
import json
import logging
from typing import Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

logger = logging.getLogger("TutorDocBackend")

def get_drive_credentials() -> Optional[service_account.Credentials]:
    """Retrieves Google service account credentials from environment variables or local JSON key file."""
    scopes = ["https://www.googleapis.com/auth/drive"]
    
    # 1. Try loading from environment variable (useful for Vercel deployment)
    env_json = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_JSON")
    if env_json:
        try:
            info = json.loads(env_json)
            return service_account.Credentials.from_service_account_info(info, scopes=scopes)
        except Exception as e:
            logger.error(f"Failed to load credentials from GOOGLE_DRIVE_CREDENTIALS_JSON: {e}")

    # 2. Try loading from local key file (useful for local development, ignored by git)
    local_key_path = os.path.join(os.path.dirname(__file__), "google_drive_key.json")
    if os.path.exists(local_key_path):
        try:
            return service_account.Credentials.from_service_account_file(local_key_path, scopes=scopes)
        except Exception as e:
            logger.error(f"Failed to load credentials from google_drive_key.json: {e}")

    logger.warning("Google Drive credentials not found. Drive uploads will be skipped.")
    return None

def upload_file_to_drive(file_content: bytes, filename: str, mime_type: str, folder_id: str) -> Optional[str]:
    """Streams and uploads binary file contents directly to Google Drive folder using the Drive API."""
    if not folder_id:
        logger.warning(f"No Google Drive folder ID configured. Skipping upload for {filename}.")
        return None
        
    credentials = get_drive_credentials()
    if not credentials:
        logger.warning("No Google credentials available. Skipping upload.")
        return None
        
    try:
        service = build("drive", "v3", credentials=credentials)
        
        file_metadata = {
            "name": filename,
            "parents": [folder_id]
        }
        
        media = MediaIoBaseUpload(io.BytesIO(file_content), mimetype=mime_type, resumable=True)
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id"
        ).execute()
        
        file_id = uploaded_file.get("id")
        logger.info(f"Successfully uploaded {filename} to Google Drive. File ID: {file_id}")
        return file_id
    except Exception as e:
        logger.error(f"Google Drive upload exception for file {filename}: {e}")
        return None
