import os
import io
import json
import logging
from typing import Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

logger = logging.getLogger("TutorDocBackend")

def upload_file_to_drive(file_content: bytes, filename: str, mime_type: str, folder_id: str) -> Optional[str]:
    """Disabled by request: Prevents DriveApp.getRootFolder permission errors."""
    logger.info(f"Google Drive Webhook upload for '{filename}' skipped (disabled).")
    return None
