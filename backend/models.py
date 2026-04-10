from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class User(SQLModel, table=True):
    __tablename__ = "users"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    uid: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    display_name: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    credits: int = Field(default=250000)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    emergency_contact_number: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)

class Segment(SQLModel, table=True):
    __tablename__ = "segments"
    
    # Changed: Use segment_id to match Supabase table
    segment_id: Optional[int] = Field(default=None, primary_key=True, sa_column_kwargs={"autoincrement": True})
    lat_min: float = Field(nullable=False, index=True)
    lat_max: float = Field(nullable=False, index=True)
    lon_min: float = Field(nullable=False, index=True)
    lon_max: float = Field(nullable=False, index=True)
    safety_score: float = Field(default=5.0)  # 0-10 scale
    report_count: int = Field(default=0)
    reports: str = Field(default='[]')
    active_user_count: int = Field(default=0)
    avg_speed: Optional[float] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    def is_point_in_segment(self, lat: float, lon: float) -> bool:
        """Check if a point (lat, lon) falls within this segment"""
        return (self.lat_min <= lat <= self.lat_max and 
                self.lon_min <= lon <= self.lon_max)


class UserVerification(SQLModel, table=True):
    __tablename__ = "user_verifications"

    id: Optional[int] = Field(default=None, primary_key=True)
    uid: str = Field(unique=True, index=True)
    email_verified: bool = Field(default=False)
    phone_verified: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class OTPCode(SQLModel, table=True):
    __tablename__ = "otp_codes"

    id: Optional[int] = Field(default=None, primary_key=True)
    uid: str = Field(index=True)
    channel: str = Field(index=True)
    destination: str
    otp_hash: str
    expires_at: datetime
    attempts: int = Field(default=0)
    max_attempts: int = Field(default=5)
    is_used: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)