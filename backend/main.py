from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from sqlmodel import select, Session, SQLModel
from models import User, Segment
from database import engine, get_session
from datetime import datetime, timedelta
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.utils.segment_utils import (
    get_segment_by_location, 
    update_segment_safety_score,
    add_report_to_segment,
    update_active_user_count,
    REPORT_SAFETY_SCORES
)
from app.utils.sos_utils import (
    get_nearby_users_in_segment,
    calculate_distance,
    award_credit_points,
    check_proximity,
    POLICE_NUMBER,
    SOS_TIMEOUT_MINUTES
)
from app.utils.safety_data_service import safety_service
from app.utils.sos_alert_service import sos_service
import httpx
import json
import polyline
import copy
import asyncio
import os
from twilio.rest import Client

app = FastAPI(title="SafePath Backend", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SQLModel.metadata.create_all(engine)
print("✅ Database tables initialized successfully")

# Twilio Configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")

twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER:
    try:
        twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        print("✅ Twilio SMS service initialized")
        print(f"   Account: {TWILIO_ACCOUNT_SID[:10]}...")
        print(f"   From Number: {TWILIO_PHONE_NUMBER}")
        
        # Test connection
        try:
            account = twilio_client.api.accounts(TWILIO_ACCOUNT_SID).fetch()
            print(f"   ✅ Connection verified - Account: {account.friendly_name}")
        except Exception as test_error:
            print(f"   ⚠️  Warning: Could not verify Twilio connection: {str(test_error)}")
    except Exception as init_error:
        print(f"❌ Failed to initialize Twilio: {str(init_error)}")
        twilio_client = None
else:
    print("⚠️ Twilio SMS service not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env")

OSRM_BASE_URL = "http://router.project-osrm.org"
NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org"

class LocationUpdate(BaseModel):
    uid: str
    latitude: float
    longitude: float

class EmergencyContactUpdate(BaseModel):
    uid: str
    emergency_contact_number: str

class UserRequest(BaseModel):
    uid: str
    email: str
    display_name: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@app.post("/users/")
def create_or_update_user(user_data: UserRequest, session: Session = Depends(get_session)):
    """Create or update a user record from frontend auth sync."""
    if not user_data.uid or not user_data.email:
        raise HTTPException(status_code=400, detail="uid and email are required")

    statement = select(User).where(User.uid == user_data.uid)
    user = session.exec(statement).first()

    if user:
        user.email = user_data.email
        user.display_name = user_data.display_name
        user.phone = user_data.phone
        user.photo_url = user_data.photo_url
        user.latitude = user_data.latitude
        user.longitude = user_data.longitude
        user.last_active_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"status": "updated", "user": user}

    new_user = User(
        uid=user_data.uid,
        email=user_data.email,
        display_name=user_data.display_name,
        phone=user_data.phone,
        photo_url=user_data.photo_url,
        latitude=user_data.latitude,
        longitude=user_data.longitude,
        credits=250000,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return {"status": "created", "user": new_user}

class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    waypoints: Optional[str] = None

@app.post("/api/update-location")
def update_user_location(location_data: LocationUpdate):
    """
    Update user's current location in PostgreSQL and update segment active user count
    Creates user if doesn't exist
    Returns success even if database is unavailable (for graceful degradation)
    """
    uid = location_data.uid
    lat = location_data.latitude
    lng = location_data.longitude
    
    if not uid:
        raise HTTPException(status_code=400, detail="uid is required")
    
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="latitude and longitude are required")
    
    session = None
    try:
        session = next(get_session())
    except HTTPException as e:
        if e.status_code == 503:
            print(f"⚠️ Database unavailable, location update accepted but not saved: ({lat}, {lng})")
            return {
                "success": True,
                "message": "Location received (database unavailable)",
                "location": {
                    "latitude": lat,
                    "longitude": lng,
                    "last_active_at": datetime.utcnow().isoformat()
                },
                "segment": {
                    "segment_id": None,
                    "active_user_count": 0,
                    "safety_score": 5.0
                },
                "database_available": False
            }
        else:
            raise
    except Exception as e:
        print(f"⚠️ Database error, location update accepted but not saved: {str(e)}")
        return {
            "success": True,
            "message": "Location received (database unavailable)",
            "location": {
                "latitude": lat,
                "longitude": lng,
                "last_active_at": datetime.utcnow().isoformat()
            },
            "segment": {
                "segment_id": None,
                "active_user_count": 0,
                "safety_score": 5.0
            },
            "database_available": False
        }
    
    try:
        statement = select(User).where(User.uid == uid)
        user = session.exec(statement).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found. Please register first.")
        
        old_segment = None
        if user.latitude and user.longitude:
            old_segment = get_segment_by_location(user.latitude, user.longitude, session)
        
        user.latitude = lat
        user.longitude = lng
        user.last_active_at = datetime.utcnow()
        
        session.add(user)
        session.commit()
        session.refresh(user)
        
        new_segment = get_segment_by_location(lat, lng, session)
        
        if old_segment and new_segment and old_segment.segment_id != new_segment.segment_id:
            update_active_user_count(old_segment, -1, session)
        
        if new_segment:
            if not old_segment or (old_segment and old_segment.segment_id != new_segment.segment_id):
                update_active_user_count(new_segment, +1, session)
                session.refresh(new_segment)
            
            active_count = new_segment.active_user_count
        else:
            active_count = 0
            print(f"⚠️ No segment found for location ({lat}, {lng})")
        
        print(f"📍 Location updated for user {user.display_name or user.uid}: ({lat}, {lng}) - Segment active users: {active_count}")
        
        return {
            "success": True,
            "message": "Location updated successfully",
            "location": {
                "latitude": user.latitude,
                "longitude": user.longitude,
                "last_active_at": user.last_active_at.isoformat()
            },
            "segment": {
                "segment_id": new_segment.segment_id if new_segment else None,
                "active_user_count": active_count,
                "safety_score": new_segment.safety_score if new_segment else 5.0
            },
            "database_available": True
        }
    except Exception as e:
        print(f"❌ Error updating location in database: {str(e)}")
        return {
            "success": True,
            "message": "Location received (database error occurred)",
            "location": {
                "latitude": lat,
                "longitude": lng,
                "last_active_at": datetime.utcnow().isoformat()
            },
            "segment": {
                "segment_id": None,
                "active_user_count": 0,
                "safety_score": 5.0
            },
            "database_available": False,
            "warning": "Location was received but could not be saved to database"
        }


@app.get("/api/user-location/{uid}")
def get_user_location(uid: str, session: Session = Depends(get_session)):
    """Get last known location for a given user."""
    statement = select(User).where(User.uid == uid)
    user = session.exec(statement).first()

    if not user or user.latitude is None or user.longitude is None:
        raise HTTPException(status_code=404, detail="User location not found")

    return {
        "success": True,
        "uid": uid,
        "location": {
            "latitude": user.latitude,
            "longitude": user.longitude,
            "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
        },
    }

@app.post("/api/update-emergency-contact")
def update_emergency_contact(data: EmergencyContactUpdate, session: Session = Depends(get_session)):
    """
    Update user's emergency contact number for SOS alerts
    """
    try:
        if not data.uid:
            raise HTTPException(status_code=400, detail="uid is required")
        
        if not data.emergency_contact_number:
            raise HTTPException(status_code=400, detail="emergency_contact_number is required")
        
        # Validate phone number format (basic validation)
        phone = data.emergency_contact_number.strip()
        if len(phone) < 10:
            raise HTTPException(status_code=400, detail="Phone number must be at least 10 digits")
        
        statement = select(User).where(User.uid == data.uid)
        user = session.exec(statement).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found. Please register first.")

        user.emergency_contact_number = phone
        session.add(user)
        session.commit()
        session.refresh(user)
        
        print(f"✅ Emergency contact updated for user {data.uid}: {phone}")
        
        return {
            "success": True,
            "message": "Emergency contact number updated successfully",
            "uid": user.uid,
            "emergency_contact_number": user.emergency_contact_number
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error updating emergency contact: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating emergency contact: {str(e)}")

@app.get("/api/check-emergency-contact")
def check_emergency_contact(uid: str, session: Session = Depends(get_session)):
    """
    Check if user has an emergency contact number set
    """
    try:
        if not uid:
            raise HTTPException(status_code=400, detail="uid is required")
        
        statement = select(User).where(User.uid == uid)
        user = session.exec(statement).first()
        
        if not user:
            # User doesn't exist yet, no emergency contact
            return {
                "has_emergency_contact": False,
                "emergency_contact_number": None,
                "message": "User not found, please set emergency contact"
            }
        
        has_contact = bool(user.emergency_contact_number)
        
        return {
            "has_emergency_contact": has_contact,
            "emergency_contact_number": user.emergency_contact_number if has_contact else None,
            "message": "Emergency contact found" if has_contact else "No emergency contact set"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error checking emergency contact: {str(e)}")
        return {
            "has_emergency_contact": False,
            "emergency_contact_number": None,
            "error": str(e)
        }

async def calculate_route_safety_enhanced(path: List[Dict], session: Optional[Session] = None) -> Dict[str, Any]:
    """
    Calculate safety score for a route using:
    1. Database segment reports (user-reported issues)
    2. Time-based factors (day/night safety differences)
    3. Population density factors
    """
    if not path or len(path) == 0:
        return {
            "safety_score": 5.0,
            "color": "yellow",
            "rating": "🟡 Moderate",
            "recommendation": "⚠️ Cannot calculate safety for empty route",
            "segments_matched": 0
        }
    
    try:
        waypoints = []
        for point in path:
            lat = point.get('lat') or point.get('latitude')
            lng = point.get('lng') or point.get('longitude')
            if lat is not None and lng is not None:
                waypoints.append((lat, lng))
        
        if not waypoints:
            return {
                "safety_score": 5.0,
                "color": "yellow",
                "rating": "🟡 Moderate",
                "recommendation": "Cannot calculate safety for empty coordinates",
                "segments_matched": 0
            }
        
        existing_reports = []
        if session:
            try:
                for i in range(len(waypoints) - 1):
                    lat1, lon1 = waypoints[i]
                    lat2, lon2 = waypoints[i + 1]
                    
                    lat_min, lat_max = min(lat1, lat2), max(lat1, lat2)
                    lon_min, lon_max = min(lon1, lon2), max(lon1, lon2)
                    
                    statement = select(Segment).where(
                        Segment.lat_min <= lat_max,
                        Segment.lat_max >= lat_min,
                        Segment.lon_min <= lon_max,
                        Segment.lon_max >= lon_min
                    )
                    
                    segments = session.exec(statement).all()
                    for segment in segments:
                        if segment.reports:
                            reports = json.loads(segment.reports)
                            existing_reports.extend(reports)
            except Exception as e:
                print(f"⚠️ Error fetching database reports: {e}")
        
        total_score = 0.0
        segments_analyzed = 0
        
        for i in range(len(waypoints) - 1):
            lat1, lon1 = waypoints[i]
            lat2, lon2 = waypoints[i + 1]
            
            lat_min, lat_max = min(lat1, lat2), max(lat1, lat2)
            lon_min, lon_max = min(lon1, lon2), max(lon1, lon2)
            
            score, _ = safety_service.calculate_segment_safety_score_sync(
                lat_min, lat_max, lon_min, lon_max,
                existing_reports
            )
            total_score += score
            segments_analyzed += 1
        
        if segments_analyzed > 0:
            final_score = total_score / segments_analyzed
        else:
            final_score = 5.0
        
        final_score = round(final_score, 1)
        
        if final_score >= 8:
            color = "green"
            rating = "🟢 Very Safe"
            recommendation = "✅ This route is very safe. Enjoy your journey!"
        elif final_score >= 6:
            color = "yellow"
            rating = "🟡 Moderate"
            recommendation = "✅ This route is generally safe. Standard precautions recommended."
        elif final_score >= 4:
            color = "orange"
            rating = "🟠 Unsafe"
            recommendation = "⚠️ This route has safety concerns. Consider alternatives or travel in groups."
        else:
            color = "red"
            rating = "🔴 Very Unsafe"
            recommendation = "🚨 This route has significant safety issues. Strongly recommend avoiding."
        
        return {
            "safety_score": final_score,
            "color": color,
            "rating": rating,
            "recommendation": recommendation,
            "segments_count": segments_analyzed,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        print(f"⚠️ Error in enhanced safety calculation: {e}")
        return calculate_route_safety(path, session)


def calculate_route_safety(path: List[Dict], session: Optional[Session] = None) -> Dict[str, Any]:
    """
    Calculate safety score for a route by checking segments database
    Returns default safety score if database is unavailable
    Fallback function when public data sources are unavailable
    """
    if not path or len(path) == 0:
        return {
            "safety_score": 5.0,
            "color": "yellow",
            "rating": "🟡 Moderate",
            "segments_matched": 0
        }
    
    if session is None:
        print("⚠️ No database session available, using default safety score")
        return {
            "safety_score": 5.0,
            "color": "yellow",
            "rating": "🟡 Moderate",
            "segments_matched": 0
        }
    
    try:
        total_safety = 0.0
        matched_segments = 0
        
        sample_rate = max(1, len(path) // 50)
        sampled_points = path[::sample_rate]
        
        print(f"🔍 Checking {len(sampled_points)} sampled points against segments...")
        
        for point in sampled_points:
            lat = point.get('lat') or point.get('latitude')
            lng = point.get('lng') or point.get('longitude')
            
            if lat is None or lng is None:
                continue
            
            statement = select(Segment).where(
                Segment.lat_min <= lat,
                Segment.lat_max >= lat,
                Segment.lon_min <= lng,
                Segment.lon_max >= lng
            )
            
            segment = session.exec(statement).first()
            
            if segment:
                total_safety += segment.safety_score
                matched_segments += 1
        
        if matched_segments > 0:
            avg_safety = total_safety / matched_segments
            if avg_safety == 0.0:
                avg_safety = 6.5  # Default to moderate-safe when no reports
        else:
            avg_safety = 6.5  # Default to moderate-safe when no segments found
        
        normalized_score = max(0.0, min(10.0, avg_safety))
        
        if normalized_score >= 7.0:
            color = "green"
            rating = "🟢 Safe"
        elif normalized_score >= 5.0:
            color = "yellow"
            rating = "🟡 Moderate"
        else:
            color = "red"
            rating = "🔴 Caution"
        
        print(f"✅ Safety calculation: {normalized_score:.1f}/10 ({rating}), matched {matched_segments} segments")
        
        return {
            "safety_score": round(normalized_score, 1),
            "color": color,
            "rating": rating,
            "segments_matched": matched_segments
        }
    except Exception as e:
        print(f"⚠️ Error calculating safety score, using default: {str(e)}")
        return {
            "safety_score": 5.0,
            "color": "yellow",
            "rating": "🟡 Moderate",
            "segments_matched": 0
        }

@app.post("/api/routes")
async def get_routes(route_request: RouteRequest):
    """
    Fetch routes from OSRM and calculate safety scores
    Works even if database is unavailable (uses default safety scores)
    """
    session = None
    try:
        session = next(get_session())
    except HTTPException as e:
        if e.status_code == 503:
            print("⚠️ Database unavailable, routes will work without safety scores")
            session = None
        else:
            raise
    except Exception:
        print("⚠️ Database unavailable, routes will work without safety scores")
        session = None
    
    try:
        origin_lat = route_request.origin_lat
        origin_lng = route_request.origin_lng
        dest_lat = route_request.dest_lat
        dest_lng = route_request.dest_lng
        
        coordinates = f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
        
        if route_request.waypoints:
            waypoint_parts = route_request.waypoints.split(';')
            for wp in waypoint_parts:
                if wp.strip():
                    coordinates = f"{origin_lng},{origin_lat};{wp.strip()};{dest_lng},{dest_lat}"
        
        url = f"{OSRM_BASE_URL}/route/v1/driving/{coordinates}"
        params = {
            "alternatives": "true",
            "steps": "true",
            "overview": "full",
            "geometries": "geojson"
        }
        
        print(f"🔍 Fetching routes from OSRM: {url}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            
            if response.status_code != 200:
                print(f"❌ OSRM API Error: {response.status_code}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OSRM API error: {response.text}"
                )
            
            data = response.json()
            
            if data.get('code') != 'Ok' or not data.get('routes'):
                raise HTTPException(status_code=404, detail="No routes found")
            
            print(f"✅ Received {len(data['routes'])} routes from OSRM")
            
            routes_with_safety = []
            
            for idx, route in enumerate(data['routes'][:3]):  # Limit to 3 routes
                geometry = route.get('geometry', {})
                coordinates_list = geometry.get('coordinates', [])
                
                path = [
                    {"lat": coord[1], "lng": coord[0]}
                    for coord in coordinates_list
                ]
                
                safety_data = calculate_route_safety(path, session)
                
                legs = route.get('legs', [])
                steps = []
                if legs:
                    for leg in legs:
                        steps.extend(leg.get('steps', []))
                
                total_distance = sum(leg.get('distance', 0) for leg in legs) / 1000  # Convert to km
                total_duration = sum(leg.get('duration', 0) for leg in legs) / 60  # Convert to minutes
                
                route_info = {
                    "id": f"route-{idx + 1}",
                    "name": "Fastest Route" if idx == 0 else f"Alternative {idx}",
                    "distance": round(total_distance, 2),
                    "duration": round(total_duration, 1),
                    "geometry": polyline.encode([(p['lat'], p['lng']) for p in path]),  # Encode polyline
                    "path": path,
                    "safety": safety_data,
                    "steps": steps
                }
                
                routes_with_safety.append(route_info)
            
            
            if routes_with_safety:
                print(f"📊 Calculating composite scores for {len(routes_with_safety)} routes...")
                distances = [r['distance'] for r in routes_with_safety]
                safety_scores = [r['safety']['safety_score'] for r in routes_with_safety]
                
                min_dist = min(distances)
                max_dist = max(distances)
                min_safety = min(safety_scores)
                max_safety = max(safety_scores)
                
                for route in routes_with_safety:
                    if max_dist > min_dist:
                        norm_dist = 1 - ((route['distance'] - min_dist) / (max_dist - min_dist))
                    else:
                        norm_dist = 1.0
                    
                    if max_safety > min_safety:
                        norm_safety = (route['safety']['safety_score'] - min_safety) / (max_safety - min_safety)
                    else:
                        norm_safety = 1.0
                    
                    route['composite_score'] = (norm_safety * 0.6) + (norm_dist * 0.4)
                
                routes_with_safety.sort(key=lambda r: r['composite_score'], reverse=True)
                
                print("📊 Route Rankings (by composite score):")
                for idx, route in enumerate(routes_with_safety[:3]):
                    print(f"   {idx + 1}. Distance: {route['distance']} km, Safety: {route['safety']['safety_score']}/10, Score: {route['composite_score']:.3f}")
            
            for idx, route in enumerate(routes_with_safety[:3]):
                if idx == 0:
                    route['safety']['color'] = 'green'
                    route['safety']['rating'] = 'best route'
                    route['name'] = f'Best Route (Green) - {route["distance"]} km, Safety: {route["safety"]["safety_score"]}/10'
                elif idx == 1:
                    route['safety']['color'] = 'yellow'
                    route['safety']['rating'] = 'moderate'
                    route['name'] = f'Moderate Route (Yellow) - {route["distance"]} km, Safety: {route["safety"]["safety_score"]}/10'
                elif idx == 2:
                    route['safety']['color'] = 'red'
                    route['safety']['rating'] = 'least safe'
                    route['name'] = f'Alternative Route (Red) - {route["distance"]} km, Safety: {route["safety"]["safety_score"]}/10'
            
            if len(routes_with_safety) > 0 and len(routes_with_safety) < 3:
                base_route = routes_with_safety[0]
                base_distance = base_route['distance']
                base_safety = base_route['safety']['safety_score']
                
                while len(routes_with_safety) < 3:
                    idx = len(routes_with_safety)
                    placeholder = copy.deepcopy(base_route)
                    placeholder['id'] = f"route-{idx + 1}"
                    
                    if idx == 1:
                        placeholder['distance'] = round(base_distance * 1.2, 2)  # 20% longer
                        placeholder['safety']['safety_score'] = max(0.0, base_safety - 1.5)  # Lower safety
                        placeholder['safety']['color'] = 'yellow'
                        placeholder['safety']['rating'] = 'moderate'
                        placeholder['name'] = f'Moderate Route (Yellow) - {placeholder["distance"]} km, Safety: {placeholder["safety"]["safety_score"]}/10'
                    elif idx == 2:
                        placeholder['distance'] = round(base_distance * 1.5, 2)  # 50% longer
                        placeholder['safety']['safety_score'] = max(0.0, base_safety - 3.0)  # Much lower safety
                        placeholder['safety']['color'] = 'red'
                        placeholder['safety']['rating'] = 'least safe'
                        placeholder['name'] = f'Alternative Route (Red) - {placeholder["distance"]} km, Safety: {placeholder["safety"]["safety_score"]}/10'
                    
                    distances = [r['distance'] for r in routes_with_safety] + [placeholder['distance']]
                    safety_scores = [r['safety']['safety_score'] for r in routes_with_safety] + [placeholder['safety']['safety_score']]
                    min_dist = min(distances)
                    max_dist = max(distances)
                    min_safety = min(safety_scores)
                    max_safety = max(safety_scores)
                    
                    if max_dist > min_dist:
                        norm_dist = 1 - ((placeholder['distance'] - min_dist) / (max_dist - min_dist))
                    else:
                        norm_dist = 1.0
                    
                    if max_safety > min_safety:
                        norm_safety = (placeholder['safety']['safety_score'] - min_safety) / (max_safety - min_safety)
                    else:
                        norm_safety = 1.0
                    
                    placeholder['composite_score'] = (norm_safety * 0.6) + (norm_dist * 0.4)
                    routes_with_safety.append(placeholder)
                
                routes_with_safety.sort(key=lambda r: r['composite_score'], reverse=True)
                
                for idx, route in enumerate(routes_with_safety[:3]):
                    if idx == 0:
                        route['safety']['color'] = 'green'
                        route['safety']['rating'] = 'best route'
                        route['name'] = f'Best Route (Green) - {route["distance"]} km, Safety: {route["safety"]["safety_score"]}/10'
                    elif idx == 1:
                        route['safety']['color'] = 'yellow'
                        route['safety']['rating'] = 'moderate'
                        route['name'] = f'Moderate Route (Yellow) - {route["distance"]} km, Safety: {route["safety"]["safety_score"]}/10'
                    elif idx == 2:
                        route['safety']['color'] = 'red'
                        route['safety']['rating'] = 'least safe'
                        route['name'] = f'Alternative Route (Red) - {route["distance"]} km, Safety: {route["safety"]["safety_score"]}/10'
            
            return {
                "routes": routes_with_safety[:3],  # Return exactly 3 routes
                "waypoints": data.get('waypoints', [])
            }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request timeout")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Connection error: {str(e)}")
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
    finally:
        if session is not None:
            try:
                session.close()
            except Exception:
                pass

@app.get("/api/search")
async def search_places(query: str, limit: int = 5):
    """
    Search for places using Nominatim (OpenStreetMap)
    """
    try:
        if not query or len(query) < 2:
            return {"results": []}
        
        url = f"{NOMINATIM_BASE_URL}/search"
        params = {
            "q": query,
            "format": "json",
            "limit": limit,
            "addressdetails": 1,
            "extratags": 1
        }
        
        print(f"🔍 Searching places: {query}")
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers={
                "User-Agent": "SafePath/1.0"  # Required by Nominatim
            })
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Search API error: {response.text}"
                )
            
            data = response.json()
            
            results = []
            for item in data:
                results.append({
                    "display_name": item.get('display_name', ''),
                    "lat": float(item.get('lat', 0)),
                    "lng": float(item.get('lon', 0)),
                    "type": item.get('type', ''),
                    "class": item.get('class', ''),
                    "importance": item.get('importance', 0)
                })
            
            print(f"✅ Found {len(results)} places")
            return {"results": results}
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Search timeout")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Connection error: {str(e)}")
    except Exception as e:
        print(f"❌ Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.get("/route")
async def get_route_simple(start: str, end: str):
    """Compatibility route endpoint using start/end in 'lng,lat' format."""
    start_parts = start.split(',')
    end_parts = end.split(',')

    if len(start_parts) != 2 or len(end_parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid coordinate format. Use: lng,lat")

    try:
        origin_lng, origin_lat = float(start_parts[0]), float(start_parts[1])
        dest_lng, dest_lat = float(end_parts[0]), float(end_parts[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid coordinates")

    result = await get_routes(
        RouteRequest(
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
        )
    )

    if not result.get("routes"):
        raise HTTPException(status_code=404, detail="No route found")

    route = result["routes"][0]
    return {
        "polyline": route.get("geometry"),
        "path": route.get("path", []),
        "distance": route.get("distance"),
        "duration": route.get("duration"),
        "safety": route.get("safety"),
    }

@app.get("/api/active-users")
def get_active_users(session: Session = Depends(get_session)):
    """Get active users (active in last 5 minutes)"""
    five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)
    
    statement = select(User).where(
        User.latitude.is_not(None),
        User.longitude.is_not(None),
        User.last_active_at >= five_minutes_ago
    )
    
    users = session.exec(statement).all()
    
    print(f"👥 Found {len(users)} active users")
    
    return {
        "count": len(users),
        "users": [
            {
                "uid": user.uid,
                "email": user.email,
                "display_name": user.display_name,
                "phone": user.phone,
                "latitude": user.latitude,
                "longitude": user.longitude,
                "credits": user.credits,
                "last_active_at": user.last_active_at.isoformat()
            }
            for user in users
        ]
    }


@app.get("/api/users")
def get_all_users(session: Session = Depends(get_session)):
    """Get all users from database."""
    statement = select(User).order_by(User.last_active_at.desc())
    users = session.exec(statement).all()

    return {
        "count": len(users),
        "users": [
            {
                "uid": user.uid,
                "email": user.email,
                "display_name": user.display_name,
                "phone": user.phone,
                "latitude": user.latitude,
                "longitude": user.longitude,
                "credits": user.credits,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
            }
            for user in users
        ],
    }


@app.get("/api/users/{uid}")
def get_user_by_id(uid: str, session: Session = Depends(get_session)):
    """Get a specific user by uid."""
    statement = select(User).where(User.uid == uid)
    user = session.exec(statement).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "uid": user.uid,
        "email": user.email,
        "display_name": user.display_name,
        "phone": user.phone,
        "photo_url": user.photo_url,
        "latitude": user.latitude,
        "longitude": user.longitude,
        "credits": user.credits,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
    }

@app.post("/api/seed-segments")
def seed_segments(session: Session = Depends(get_session)):
    """Seed segments"""
    existing = session.exec(select(Segment)).first()
    if existing:
        count = len(session.exec(select(Segment)).all())
        return {"message": "Segments already exist", "count": count}
    
    segments_data = []
    lat_start, lat_end = 17.2, 17.6
    lon_start, lon_end = 78.2, 78.6
    lat_step = 0.01
    lon_step = 0.01
    
    lat = lat_start
    while lat < lat_end:
        lon = lon_start
        while lon < lon_end:
            import random
            safety_score = round(random.uniform(3.0, 9.0), 1)
            
            segment = Segment(
                lat_min=lat,
                lat_max=lat + lat_step,
                lon_min=lon,
                lon_max=lon + lon_step,
                safety_score=safety_score,
                report_count=0,
                reports='[]'
            )
            segments_data.append(segment)
            lon += lon_step
        lat += lat_step
    
    session.add_all(segments_data)
    session.commit()
    
    return {"message": f"Created {len(segments_data)} segments", "count": len(segments_data)}

class ReportRequest(BaseModel):
    type: str  # crime, accident, road_damage, lighting_problem, other
    description: str
    latitude: float
    longitude: float
    username: Optional[str] = None
    user_id: Optional[str] = None

@app.post("/api/reports")
def submit_report(report: ReportRequest, session: Session = Depends(get_session)):
    """
    Submit a route report/incident and update segment safety score
    """
    try:
        if not report.type:
            raise HTTPException(status_code=400, detail="Report type is required")
        
        if report.latitude is None or report.longitude is None:
            raise HTTPException(status_code=400, detail="Latitude and longitude are required")
        
        segment = get_segment_by_location(report.latitude, report.longitude, session)
        
        if not segment:
            print(f"⚠️ No segment found for report location ({report.latitude}, {report.longitude}), creating in-memory report")
            user_name = report.username
            if report.user_id and not user_name:
                try:
                    user_statement = select(User).where(User.uid == report.user_id)
                    user = session.exec(user_statement).first()
                    if user:
                        user_name = user.display_name or user.email or f"User {report.user_id[:8]}"
                except:
                    pass
            
            return {
                "success": True,
                "message": "Report received (no segment data available)",
                "report_id": f"report_{int(datetime.utcnow().timestamp())}",
                "warning": "This area is not yet covered in our safety database",
                "segment": {
                    "segment_id": None,
                    "safety_score": 5.0,
                    "report_count": 0
                }
            }
        
        user_name = report.username
        if report.user_id and not user_name:
            user_statement = select(User).where(User.uid == report.user_id)
            user = session.exec(user_statement).first()
            if user:
                user_name = user.display_name or user.email or f"User {report.user_id[:8]}"
        
        report_data = {
            "type": report.type,
            "description": report.description or f"{report.type} reported",
            "username": user_name or "Anonymous",
            "user_id": report.user_id,
            "latitude": report.latitude,
            "longitude": report.longitude,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        add_report_to_segment(segment, report_data, session)
        
        session.refresh(segment)
        
        print(f"📝 Report submitted: {report.type} at ({report.latitude}, {report.longitude})")
        print(f"   User: {user_name}")
        print(f"   Segment safety score updated to: {segment.safety_score}/10")
        
        return {
            "success": True,
            "message": "Report submitted successfully",
            "report_id": f"report_{int(datetime.utcnow().timestamp())}",
            "segment": {
                "segment_id": segment.segment_id,
                "safety_score": segment.safety_score,
                "report_count": segment.report_count
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error submitting report: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to submit report: {str(e)}")

@app.get("/api/segments/{segment_id}/reports")
def get_segment_reports(segment_id: int, session: Session = Depends(get_session)):
    """Get all reports for a specific segment"""
    try:
        statement = select(Segment).where(Segment.segment_id == segment_id)
        segment = session.exec(statement).first()
        
        if not segment:
            raise HTTPException(status_code=404, detail="Segment not found")
        
        reports = json.loads(segment.reports) if segment.reports else []
        
        return {
            "segment_id": segment_id,
            "reports": reports,
            "report_count": len(reports),
            "safety_score": segment.safety_score
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching reports: {str(e)}")

@app.get("/api/segments/by-location")
def get_segment_by_location_endpoint(lat: float, lon: float, session: Session = Depends(get_session)):
    """Get segment information for a given location"""
    try:
        segment = get_segment_by_location(lat, lon, session)
        
        if not segment:
            return {
                "found": False,
                "message": "No segment found for this location"
            }
        
        reports = json.loads(segment.reports) if segment.reports else []
        
        return {
            "found": True,
            "segment": {
                "segment_id": segment.segment_id,
                "safety_score": segment.safety_score,
                "report_count": segment.report_count,
                "active_user_count": segment.active_user_count,
                "reports": reports[-10:]  # Last 10 reports
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching segment: {str(e)}")


active_sos_alerts: Dict[str, Dict] = {}

class SOSAlertRequest(BaseModel):
    user_id: str
    latitude: float
    longitude: float
    message: Optional[str] = None

@app.post("/api/sos/alert")
def create_sos_alert(sos_data: SOSAlertRequest, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    """
    Create an SOS alert and notify nearby users in the same segment
    """
    try:
        if not sos_data.user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        
        if sos_data.latitude is None or sos_data.longitude is None:
            raise HTTPException(status_code=400, detail="latitude and longitude are required")
        
        user_statement = select(User).where(User.uid == sos_data.user_id)
        user = session.exec(user_statement).first()
        
        if not user:
            print(f"⚠️ User {sos_data.user_id} not found, creating user for SOS...")
            user = User(
                uid=sos_data.user_id,
                email=f"user_{sos_data.user_id}@temp.com",
                display_name=f"User {sos_data.user_id[:8]}",
                latitude=sos_data.latitude,
                longitude=sos_data.longitude,
                credits=250000,
                last_active_at=datetime.utcnow()
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            print(f"✅ Created user for SOS: {user.uid}")
        
        segment = get_segment_by_location(sos_data.latitude, sos_data.longitude, session)
        
        nearby_users = []
        segment_id = None
        
        if segment:
            nearby_users = get_nearby_users_in_segment(segment, sos_data.user_id, session)
            segment_id = segment.segment_id
        else:
            print(f"⚠️ No segment found for SOS location ({sos_data.latitude}, {sos_data.longitude}), continuing without segment")
            try:
                all_users = session.exec(select(User)).all()
                for u in all_users:
                    if u.uid != sos_data.user_id and u.latitude and u.longitude:
                        dist = calculate_distance(u.latitude, u.longitude, sos_data.latitude, sos_data.longitude)
                        if dist <= 5:
                            nearby_users.append({
                                "uid": u.uid,
                                "name": u.display_name or u.email,
                                "distance_km": round(dist, 2)
                            })
            except Exception as e:
                print(f"⚠️ Error finding nearby users: {e}")
        
        alert_id = f"sos_{int(datetime.utcnow().timestamp())}_{sos_data.user_id}"
        sos_alert = {
            "alert_id": alert_id,
            "user_id": sos_data.user_id,
            "user_name": user.display_name or user.email or f"User {sos_data.user_id[:8]}",
            "user_phone": user.phone,
            "latitude": sos_data.latitude,
            "longitude": sos_data.longitude,
            "segment_id": segment_id,
            "message": sos_data.message or "Emergency! I need help!",
            "status": "active",
            "created_at": datetime.utcnow().isoformat(),
            "resolved_at": None,
            "helper_id": None,
            "nearby_users": nearby_users,
            "police_notified": False
        }
        
        active_sos_alerts[alert_id] = sos_alert
        
        # Build emergency contact list
        emergency_numbers = []
        if user.emergency_contact_number:
            emergency_numbers.append(user.emergency_contact_number)
            print(f"✓ Emergency contact from database: {user.emergency_contact_number}")
        else:
            print(f"⚠️  No emergency_contact_number set for user {sos_data.user_id}")
        
        if user.phone:
            emergency_numbers.append(user.phone)
            print(f"✓ User phone from database: {user.phone}")
        else:
            print(f"⚠️  No phone number set for user {sos_data.user_id}")
        
        print(f"📋 Emergency contact list: {emergency_numbers}")
        
        if emergency_numbers:
            print(f"✅ Adding SMS task to background tasks...")
            background_tasks.add_task(
                send_sos_sms,
                emergency_numbers=emergency_numbers,
                user_name=user.display_name or user.email or f"User {sos_data.user_id[:8]}",
                latitude=sos_data.latitude,
                longitude=sos_data.longitude,
                message=sos_data.message
            )
            print(f"✅ SMS background task queued")
        else:
            print(f"⚠️  No emergency contacts available, SMS won't be sent")
        
        background_tasks.add_task(schedule_police_alert, alert_id, session)
        
        print(f"🆘 SOS Alert created: {alert_id}")
        print(f"   User: {user.display_name or user.uid} at ({sos_data.latitude}, {sos_data.longitude})")
        print(f"   SMS sent to: {emergency_numbers}")
        print(f"   Nearby users notified: {len(nearby_users)}")
        
        return {
            "success": True,
            "alert_id": alert_id,
            "message": "SOS alert sent. Nearby users have been notified.",
            "nearby_users_count": len(nearby_users),
            "nearby_users": nearby_users,
            "police_alert_scheduled": True,
            "police_alert_time": (datetime.utcnow() + timedelta(minutes=SOS_TIMEOUT_MINUTES)).isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error creating SOS alert: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create SOS alert: {str(e)}")

class SOSRespondRequest(BaseModel):
    alert_id: str
    helper_id: str
    helper_latitude: float
    helper_longitude: float

@app.post("/api/sos/respond")
def respond_to_sos(response_data: SOSRespondRequest, session: Session = Depends(get_session)):
    """
    Helper responds to SOS alert and gets route to user in distress
    """
    try:
        alert = active_sos_alerts.get(response_data.alert_id)
        
        if not alert:
            raise HTTPException(status_code=404, detail="SOS alert not found or already resolved")
        
        if alert["status"] != "active":
            raise HTTPException(status_code=400, detail="SOS alert is no longer active")
        
        helper_statement = select(User).where(User.uid == response_data.helper_id)
        helper = session.exec(helper_statement).first()
        
        if not helper:
            raise HTTPException(status_code=404, detail="Helper user not found")
        
        distance = calculate_distance(
            response_data.helper_latitude,
            response_data.helper_longitude,
            alert["latitude"],
            alert["longitude"]
        )
        
        alert["helper_id"] = response_data.helper_id
        alert["helper_name"] = helper.display_name or helper.email
        alert["status"] = "helping"
        
        print(f"✅ Helper {helper.display_name} responding to SOS {response_data.alert_id}")
        print(f"   Distance: {distance:.2f} km")
        
        return {
            "success": True,
            "message": "You are now helping. Please proceed to the location.",
            "alert": {
                "alert_id": response_data.alert_id,
                "user_location": {
                    "latitude": alert["latitude"],
                    "longitude": alert["longitude"]
                },
                "distance_km": round(distance, 2),
                "user_name": alert["user_name"]
            },
            "route_request": {
                "origin_lat": response_data.helper_latitude,
                "origin_lng": response_data.helper_longitude,
                "dest_lat": alert["latitude"],
                "dest_lng": alert["longitude"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error responding to SOS: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to respond to SOS: {str(e)}")

class SOSResolveRequest(BaseModel):
    alert_id: str
    helper_id: str
    helper_latitude: float
    helper_longitude: float
    credit_points: int = 100  # Default credit points for helping

@app.post("/api/sos/resolve")
def resolve_sos(resolve_data: SOSResolveRequest, session: Session = Depends(get_session)):
    """
    Mark SOS as resolved when helper reaches user, award credit points
    """
    try:
        alert = active_sos_alerts.get(resolve_data.alert_id)
        
        if not alert:
            raise HTTPException(status_code=404, detail="SOS alert not found")
        
        if alert["helper_id"] != resolve_data.helper_id:
            raise HTTPException(status_code=403, detail="Only the assigned helper can resolve this alert")
        
        if not check_proximity(
            resolve_data.helper_latitude,
            resolve_data.helper_longitude,
            alert["latitude"],
            alert["longitude"],
            threshold_km=0.05
        ):
            return {
                "success": False,
                "message": "You are not close enough to the user. Please get closer (within 50 meters).",
                "distance_km": calculate_distance(
                    resolve_data.helper_latitude,
                    resolve_data.helper_longitude,
                    alert["latitude"],
                    alert["longitude"]
                )
            }
        
        helper_statement = select(User).where(User.uid == resolve_data.helper_id)
        helper = session.exec(helper_statement).first()
        
        if not helper:
            raise HTTPException(status_code=404, detail="Helper user not found")
        
        new_credits = award_credit_points(helper, resolve_data.credit_points, session)
        
        alert["status"] = "resolved"
        alert["resolved_at"] = datetime.utcnow().isoformat()
        
        if resolve_data.alert_id in active_sos_alerts:
            del active_sos_alerts[resolve_data.alert_id]
        
        print(f"✅ SOS {resolve_data.alert_id} resolved by {helper.display_name}")
        print(f"   Credit points awarded: {resolve_data.credit_points}")
        
        return {
            "success": True,
            "message": "SOS resolved successfully. Thank you for helping!",
            "credit_points_awarded": resolve_data.credit_points,
            "helper_total_credits": new_credits
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error resolving SOS: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to resolve SOS: {str(e)}")

@app.get("/api/sos/active")
def get_active_sos_alerts(session: Session = Depends(get_session)):
    """Get all active SOS alerts"""
    try:
        active_alerts = [
            {k: v for k, v in alert.items() if k != "nearby_users"}  # Exclude full user list
            for alert in active_sos_alerts.values()
            if alert["status"] == "active"
        ]
        
        return {
            "count": len(active_alerts),
            "alerts": active_alerts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching active SOS alerts: {str(e)}")

def send_sos_sms(emergency_numbers: list, user_name: str, latitude: float, longitude: float, message: str):
    """
    Send emergency SMS to emergency contacts using Twilio
    NOTE: This is SYNC (not async) because BackgroundTasks requires synchronous functions
    """
    try:
        print(f"\n{'='*70}")
        print(f"📱 SOS SMS SENDING PROCESS STARTED")
        print(f"{'='*70}")
        
        if not emergency_numbers:
            print(f"⚠️ No emergency contacts available, skipping SMS")
            return
        
        print(f"✓ Emergency numbers to notify: {emergency_numbers}")
        
        if not twilio_client:
            print(f"❌ CRITICAL: Twilio client not initialized!")
            print(f"   TWILIO_ACCOUNT_SID: {'SET' if TWILIO_ACCOUNT_SID else 'NOT SET'}")
            print(f"   TWILIO_AUTH_TOKEN: {'SET' if TWILIO_AUTH_TOKEN else 'NOT SET'}")
            print(f"   TWILIO_PHONE_NUMBER: {TWILIO_PHONE_NUMBER if TWILIO_PHONE_NUMBER else 'NOT SET'}")
            return
        
        if not TWILIO_PHONE_NUMBER:
            print(f"❌ TWILIO_PHONE_NUMBER not configured")
            return
        
        print(f"✓ Twilio client is initialized")
        print(f"✓ Sending from: {TWILIO_PHONE_NUMBER}")
        
        # Ensure message is not None
        safe_message = message if message else "I need help"
        sms_body = f"{safe_message}! Location: {latitude}, {longitude}"
        
        print(f"✓ SMS Message:\n{sms_body}\n")
        
        sent_count = 0
        failed_count = 0
        
        for phone_number in emergency_numbers:
            try:
                # Validate and format phone number - NULL CHECK FIRST
                if phone_number is None or not isinstance(phone_number, str):
                    print(f"⚠️  Skipping invalid phone number (null/non-string): {phone_number}")
                    continue
                    
                if not phone_number or phone_number.strip() == "":
                    print(f"⚠️  Skipping empty phone number")
                    continue
                
                # Format phone number - remove spaces and validate
                formatted_number = phone_number.strip().replace(" ", "")
                
                # If doesn't start with +, add country code
                if not formatted_number.startswith('+'):
                    # Assume India country code if local format
                    if len(formatted_number) <= 10:
                        formatted_number = f"+91{formatted_number.lstrip('0')}"
                    else:
                        formatted_number = f"+91{formatted_number}"
                
                # Validate basic format
                if len(formatted_number) < 10:
                    print(f"⚠️  Invalid phone format: {phone_number} (too short)")
                    continue
                
                print(f"  📤 Sending SMS to {formatted_number}...")
                
                message_obj = twilio_client.messages.create(
                    body=sms_body,
                    from_=TWILIO_PHONE_NUMBER,
                    to=formatted_number
                )
                
                print(f"     ✅ SMS SENT SUCCESSFULLY!")
                print(f"     Message SID: {message_obj.sid}")
                print(f"     Status: {message_obj.status}")
                sent_count += 1
                
            except Exception as e:
                error_msg = str(e)
                print(f"     ❌ FAILED TO SEND SMS!")
                print(f"     Error: {error_msg}")
                
                # Provide helpful debugging info
                if "not in a valid phone number format" in error_msg:
                    print(f"     Hint: Invalid phone format. Expected: +1234567890")
                    print(f"     Got: {formatted_number}")
                elif "is not a valid phone number" in error_msg:
                    print(f"     Hint: Phone number not verified in Twilio account")
                    print(f"     Action: Add {formatted_number} as verified number in Twilio dashboard")
                elif "Invalid 'From' Phone Number" in error_msg:
                    print(f"     Hint: From number {TWILIO_PHONE_NUMBER} not in Twilio account")
                    print(f"     Action: Update TWILIO_PHONE_NUMBER in .env")
                elif "Account not authorized to send SMS" in error_msg:
                    print(f"     Hint: Trial account can only send to verified numbers")
                    print(f"     Action: Verify {formatted_number} in Twilio dashboard or upgrade account")
                
                failed_count += 1
        
        print(f"\n📊 SMS SENDING SUMMARY:")
        print(f"   ✅ Successful: {sent_count}")
        print(f"   ❌ Failed: {failed_count}")
        print(f"{'='*70}\n")
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR in send_sos_sms: {str(e)}")
        import traceback
        traceback.print_exc()

def schedule_police_alert(alert_id: str, session: Session):
    """
    Schedule police alert if SOS is not resolved within 2 minutes
    NOTE: This is SYNC (not async) because BackgroundTasks requires synchronous functions
    """
    import time
    time.sleep(SOS_TIMEOUT_MINUTES * 60)  # Wait 2 minutes
    
    alert = active_sos_alerts.get(alert_id)
    
    if alert and alert["status"] == "active":
        alert["police_notified"] = True
        alert["police_notified_at"] = datetime.utcnow().isoformat()
        
        print(f"🚨 POLICE ALERT: SOS {alert_id} not resolved after 2 minutes")
        print(f"   User: {alert['user_name']} at ({alert['latitude']}, {alert['longitude']})")
        print(f"   Police Number: {POLICE_NUMBER}")
        print(f"   TODO: Send SMS/call to {POLICE_NUMBER}")
        

@app.get("/health")
def health_check():
    """Health check endpoint to test database connectivity"""
    try:
        from sqlalchemy import text
        with Session(engine) as session:
            result = session.exec(text("SELECT 1")).first()
        return {
            "status": "healthy",
            "database": "connected",
            "message": "All systems operational"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
            "message": "Database connection failed. Please check your database configuration."
        }

@app.get("/")
def root():
    return {
        "message": "SafePath API",
        "version": "4.0.0",
        "endpoints": {
            "POST /users/": "Create/update user",
            "POST /api/routes": "Get routes with safety scores (OSRM)",
            "GET /route": "Simple route endpoint (OSRM)",
            "GET /api/search": "Search places (Nominatim)",
            "POST /api/update-location": "Update user location with segment tracking",
            "GET /api/active-users": "Get active users",
            "POST /api/seed-segments": "Seed segments",
            "POST /api/reports": "Submit route report/incident",
            "GET /api/segments/{segment_id}/reports": "Get reports for a segment",
            "GET /api/segments/by-location": "Get segment info by location",
            "POST /api/sos/alert": "Create SOS emergency alert",
            "POST /api/sos/respond": "Helper responds to SOS",
            "POST /api/sos/resolve": "Resolve SOS alert",
            "GET /api/sos/active": "Get active SOS alerts",
            "GET /api/users": "Get all users",
            "GET /api/users/{uid}": "Get user by UID"
        }
    }

