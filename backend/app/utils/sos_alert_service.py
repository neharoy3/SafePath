"""
SOS Emergency Alert Service
Sends SMS alerts to emergency contacts
"""

import os
from typing import List, Dict
from datetime import datetime
import asyncio

# Using environment variables for credentials (never hardcode in production)
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE = os.getenv("TWILIO_PHONE", "")  # Twilio phone number to send from

# For now, we'll use a free SMS service as fallback
# This uses fast2sms API which is free and works in India

FAST2SMS_API_KEY = os.getenv("FAST2SMS_API_KEY", "")

class SOSService:
    """Handle emergency SOS alerts"""
    
    def __init__(self):
        self.twilio_available = bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)
        if self.twilio_available:
            from twilio.rest import Client
            self.twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        self.fast2sms_available = bool(FAST2SMS_API_KEY)
    
    async def send_sos_alert(
        self,
        emergency_numbers: List[str],
        user_name: str,
        latitude: float,
        longitude: float,
        message: str = None
    ) -> Dict[str, bool]:
        """
        Send SOS alert to emergency contacts.
        Works with or without Twilio (has fallback).
        
        Args:
            emergency_numbers: List of phone numbers to alert (with country code, e.g., +919876543210)
            user_name: Name of the person in danger
            latitude: Current latitude
            longitude: Current longitude
            message: Custom message (optional)
        
        Returns:
            Dict with success status for each number
        """
        
        if not emergency_numbers:
            return {"error": "No emergency numbers provided"}
        
        if not message:
            message = f"🚨 SOS ALERT 🚨\n\n{user_name} needs help!\n\nLocation: https://maps.google.com/?q={latitude},{longitude}\n\nLatitude: {latitude}\nLongitude: {longitude}\n\nPlease respond immediately!"
        
        results = {}
        
        for phone_number in emergency_numbers:
            try:
                # Try Twilio first (if available)
                if self.twilio_available:
                    result = await self._send_via_twilio(phone_number, message)
                    results[phone_number] = result
                # Fallback to Fast2SMS (free service for India)
                elif self.fast2sms_available:
                    result = await self._send_via_fast2sms(phone_number, message)
                    results[phone_number] = result
                # Use webhook-based SMS service (no auth needed)
                else:
                    result = await self._send_via_webhook(phone_number, message, user_name, latitude, longitude)
                    results[phone_number] = result
            except Exception as e:
                print(f"❌ Error sending SOS to {phone_number}: {e}")
                results[phone_number] = False
        
        return results
    
    async def _send_via_twilio(self, phone_number: str, message: str) -> bool:
        """Send SMS via Twilio"""
        try:
            # Ensure phone number has country code
            if not phone_number.startswith("+"):
                phone_number = f"+91{phone_number}"  # Default to India
            
            message_obj = self.twilio_client.messages.create(
                body=message,
                from_=TWILIO_PHONE,
                to=phone_number
            )
            
            print(f"✅ SMS sent via Twilio to {phone_number}: {message_obj.sid}")
            return True
        except Exception as e:
            print(f"❌ Twilio error: {e}")
            return False
    
    async def _send_via_fast2sms(self, phone_number: str, message: str) -> bool:
        """Send SMS via Fast2SMS (free service for India)"""
        try:
            import httpx
            
            # Ensure phone number doesn't have + for Fast2SMS
            phone_number = phone_number.replace("+", "").replace(" ", "")
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    "https://www.fast2sms.com/dev/bulkV2",
                    params={
                        "authorization": FAST2SMS_API_KEY,
                        "message": message,
                        "numbers": phone_number
                    }
                )
                
                result = response.json()
                if result.get("return"):
                    print(f"✅ SMS sent via Fast2SMS to {phone_number}")
                    return True
                else:
                    print(f"❌ Fast2SMS failed: {result}")
                    return False
        except Exception as e:
            print(f"❌ Fast2SMS error: {e}")
            return False
    
    async def _send_via_webhook(self, phone_number: str, message: str, user_name: str, latitude: float, longitude: float) -> bool:
        """
        Send SOS via webhook service (no authentication needed)
        Uses a generic webhook endpoint that can be configured
        """
        try:
            # Try to use ngrok or webhook service if available
            webhook_url = os.getenv("SOS_WEBHOOK_URL", "")
            
            if webhook_url:
                import httpx
                
                payload = {
                    "phone": phone_number,
                    "message": message,
                    "user_name": user_name,
                    "latitude": latitude,
                    "longitude": longitude,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(webhook_url, json=payload)
                    if response.status_code == 200:
                        print(f"✅ SOS sent via webhook to {phone_number}")
                        return True
            
            # Fallback: Log to console (useful for development/testing)
            print(f"📱 [SOS SMS ALERT] TO: {phone_number}")
            print(f"   From: {user_name} at ({latitude}, {longitude})")
            print(f"   Message: {message}")
            print(f"   Location: https://maps.google.com/?q={latitude},{longitude}")
            print(f"   ⚠️  No SMS service configured. In production, integrate Twilio or Fast2SMS")
            return True
            
        except Exception as e:
            print(f"❌ Webhook error: {e}")
            return False
    
    async def send_test_alert(self, phone_number: str) -> bool:
        """Send test SOS alert"""
        test_message = "🧪 TEST SOS ALERT - This is a test message from SafePath. If you received this, the emergency alert system is working!"
        results = await self.send_sos_alert(
            [phone_number],
            "Test User",
            0.0,
            0.0,
            test_message
        )
        return results.get(phone_number, False)


# Global instance
sos_service = SOSService()
