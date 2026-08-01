import httpx
import logging

logger = logging.getLogger(__name__)

async def test_sheet_connection(webhook_url: str) -> bool:
    """
    Sends a test payload to the Google Sheets Webhook URL to verify connectivity.
    Enables redirect following as Google Apps Scripts redirect request execution.
    """
    if not webhook_url:
        return False
    
    payload = {
        "file_name": "connection_test.pdf",
        "version": 0,
        "overall_score": 100.0,
        "created_at": "2026-07-25 00:00:00",
        "summary_feedback": "FastAPI Webhook Test Connection Success!"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                webhook_url,
                json=payload,
                timeout=8.0,
                headers={"Content-Type": "application/json"},
                follow_redirects=True
            )
            # Google Apps Script webhook usually returns 200 OK with text/json content if successful.
            return response.status_code in (200, 201)
    except Exception as e:
        logger.error(f"Google Sheets test connection error: {e}")
        return False

async def append_evaluation_row(
    webhook_url: str,
    file_name: str,
    version: int,
    overall_score: float,
    created_at: str,
    summary_feedback: str
) -> bool:
    """
    Asynchronously posts a row of evaluation results to the specified Google Sheets Webhook.
    Called as a Background Task in FastAPI.
    """
    if not webhook_url:
        logger.warning("Google Sheets Webhook URL not set. Skipping sheet append.")
        return False
    
    payload = {
        "file_name": file_name,
        "version": version,
        "overall_score": round(float(overall_score)),
        "created_at": created_at,
        "summary_feedback": summary_feedback
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                webhook_url,
                json=payload,
                timeout=15.0,
                headers={"Content-Type": "application/json"},
                follow_redirects=True
            )
            if response.status_code in (200, 201):
                logger.info(f"Successfully appended row to Google Sheets for file: {file_name}_v{version}")
                return True
            else:
                logger.error(f"Google Sheets webhook failed with status: {response.status_code}, response: {response.text}")
                return False
    except Exception as e:
        logger.error(f"Google Sheets webhook call exception: {e}")
        return False
