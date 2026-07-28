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
    """Sends file contents to the Google Apps Script Webhook to save in the user's personal Google Drive (VoiceTutor folder)."""
    try:
        from api.config import load_settings
    except ImportError:
        try:
            from backend.config import load_settings
        except ImportError:
            from config import load_settings

    settings = load_settings()
    webhook_url = settings.google_sheets_webhook_url
    
    if not webhook_url:
        logger.warning("No Google Webhook URL configured. Skipping upload.")
        return None
        
    logger.info(f"Uploading '{filename}' via Google Apps Script Webhook...")
    
    try:
        import base64
        import httpx
        
        # Base64 encode the binary content
        encoded_content = base64.b64encode(file_content).decode("utf-8")
        
        payload = {
            "filename": filename,
            "file_content": encoded_content,
            "mime_type": mime_type,
            "is_base64": True,
            "parent_folder_id": folder_id
        }
        
        # Call the Apps Script Webhook synchronously
        with httpx.Client() as client:
            response = client.post(
                webhook_url,
                json=payload,
                timeout=30.0,
                headers={"Content-Type": "application/json"},
                follow_redirects=True
            )
            
        if response.status_code in (200, 201):
            try:
                res_data = response.json()
                if res_data.get("status") == "success":
                    file_id = res_data.get("file_id")
                    logger.info(f"Successfully uploaded {filename} via Webhook. File ID: {file_id}")
                    return file_id
                else:
                    logger.error(f"Webhook upload failed: {res_data.get('message')}")
            except Exception as json_err:
                logger.error(f"Failed to parse Webhook JSON response: {json_err}. Response text: {response.text}")
        else:
            logger.error(f"Webhook responded with HTTP status {response.status_code}. Response: {response.text}")
            
        return None
    except Exception as e:
        logger.error(f"Google Drive Webhook upload exception for file {filename}: {e}")
        return None
