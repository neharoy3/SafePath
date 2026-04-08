"""
SOS Emergency System Utilities
"""
from sqlmodel import select, Session
import sys
import os
# Add parent directory (backend/) to path to import models
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
from models import User, Segment
from app.utils.segment_utils import get_segment_by_location
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import json
import math

# Police contact number
POLICE_NUMBER = "9392086131"
SOS_TIMEOUT_MINUTES = 2  # 2 minutes before police alert

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two points in kilometers using Haversine formula
    """
    R = 6371  # Earth radius in km
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    
    return distance

def get_nearby_users_in_segment(segment: Segment, exclude_uid: str, session: Session) -> List[Dict]:
    """
    Get all active users in the same segment (excluding the SOS sender)
    """
    try:
        # Get all active users (active in last 5 minutes)
        five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)
        
        statement = select(User).where(
            User.latitude.is_not(None),
            User.longitude.is_not(None),
            User.last_active_at >= five_minutes_ago,
            User.uid != exclude_uid
        )
        
        all_active_users = session.exec(statement).all()
        
        # Filter users in the same segment
        nearby_users = []
        for user in all_active_users:
            if segment.is_point_in_segment(user.latitude, user.longitude):
                nearby_users.append({
                    "uid": user.uid,
                    "display_name": user.display_name or user.email,
                    "email": user.email,
                    "phone": user.phone,
                    "latitude": user.latitude,
                    "longitude": user.longitude,
                    "last_active_at": user.last_active_at.isoformat()
                })
        
        return nearby_users
    except Exception as e:
        print(f"❌ Error getting nearby users: {str(e)}")
        return []

def award_credit_points(user: User, points: int, session: Session):
    """
    Award credit points to a user (helper)
    """
    try:
        user.credits += points
        session.add(user)
        session.commit()
        session.refresh(user)
        print(f"✅ Awarded {points} credit points to {user.display_name}. Total: {user.credits}")
        return user.credits
    except Exception as e:
        print(f"❌ Error awarding credits: {str(e)}")
        return user.credits

def deduct_credit_points(user: User, points: int, session: Session):
    """
    Deduct credit points from a user (for rewarding helpers)
    """
    try:
        user.credits = max(0, user.credits - points)
        session.add(user)
        session.commit()
        session.refresh(user)
        print(f"✅ Deducted {points} credit points from {user.display_name}. Remaining: {user.credits}")
        return user.credits
    except Exception as e:
        print(f"❌ Error deducting credits: {str(e)}")
        return user.credits

def check_proximity(lat1: float, lon1: float, lat2: float, lon2: float, threshold_km: float = 0.05) -> bool:
    """
    Check if two points are within threshold distance (default 50 meters)
    """
    distance = calculate_distance(lat1, lon1, lat2, lon2)
    return distance <= threshold_km

