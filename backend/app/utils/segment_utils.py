"""
Segment utility functions for efficient segment lookup and management
"""
from sqlmodel import select, Session
import sys
import os
# Add parent directory (backend/) to path to import models
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
from models import Segment
from typing import Optional, Tuple
from datetime import datetime
import json

# Report type safety scores (0-10 scale, lower = more dangerous)
REPORT_SAFETY_SCORES = {
    "crime": 1.0,
    "accident": 2.0,
    "road_damage": 3.0,
    "lighting_problem": 4.0,
    "other": 5.0
}

def get_segment_by_location(lat: float, lon: float, session: Session) -> Optional[Segment]:
    """
    Find the segment that contains the given latitude and longitude.
    Uses indexed queries for efficient lookup.
    """
    statement = select(Segment).where(
        Segment.lat_min <= lat,
        Segment.lat_max >= lat,
        Segment.lon_min <= lon,
        Segment.lon_max >= lon
    ).limit(1)
    
    return session.exec(statement).first()

def update_segment_safety_score(segment: Segment, session: Session):
    """
    Recalculate safety score for a segment based on all reports.
    Safety score is the average of all report scores (0-10 scale).
    """
    try:
        reports = json.loads(segment.reports) if segment.reports else []
        
        if not reports:
            # No reports, default to moderate safety
            segment.safety_score = 5.0
        else:
            # Calculate average of all report safety scores
            total_score = sum(report.get('safety_score', 5.0) for report in reports)
            avg_score = total_score / len(reports)
            # Ensure score is between 0-10
            segment.safety_score = max(0.0, min(10.0, round(avg_score, 1)))
        
        session.add(segment)
        session.commit()
        session.refresh(segment)
        
        return segment.safety_score
    except Exception as e:
        print(f"❌ Error updating safety score: {str(e)}")
        return segment.safety_score

def add_report_to_segment(segment: Segment, report_data: dict, session: Session):
    """
    Add a report to a segment and update safety score.
    """
    try:
        reports = json.loads(segment.reports) if segment.reports else []
        
        # Get safety score for this report type
        report_type = report_data.get('type', 'other').lower()
        safety_score = REPORT_SAFETY_SCORES.get(report_type, 5.0)
        
        # Add safety score to report data
        report_data['safety_score'] = safety_score
        report_data['timestamp'] = report_data.get('timestamp', str(datetime.utcnow()))
        
        # Add report to list
        reports.append(report_data)
        segment.reports = json.dumps(reports)
        segment.report_count = len(reports)
        
        # Update safety score
        update_segment_safety_score(segment, session)
        
        return segment
    except Exception as e:
        print(f"❌ Error adding report: {str(e)}")
        raise

def update_active_user_count(segment: Segment, delta: int, session: Session):
    """
    Update active user count in a segment.
    delta: +1 when user enters, -1 when user leaves
    """
    try:
        segment.active_user_count = max(0, segment.active_user_count + delta)
        session.add(segment)
        session.commit()
        session.refresh(segment)
        return segment.active_user_count
    except Exception as e:
        print(f"❌ Error updating active user count: {str(e)}")
        return segment.active_user_count

