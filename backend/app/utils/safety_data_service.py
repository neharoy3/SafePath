"""
Safety Data Service - Fast synchronous safety score calculation
Uses user reports, time-based factors, and population density
"""

import json
from datetime import datetime
from typing import Dict, List, Tuple

class SafetyDataService:
    """Calculate safety scores from available data sources"""
    
    def __init__(self):
        self.cache = {}
        self.cache_expiry = 3600  # 1 hour cache
    
    def calculate_segment_safety_score_sync(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
        existing_reports: List[Dict] = None
    ) -> Tuple[float, Dict]:
        """
        Fast synchronous safety score calculation.
        Returns: (safety_score: 0-10, data_dict)
        """
        scores = {}
        weights = {}
        
        # 1. User Reports Score (60% weight)
        report_score = self._calculate_report_score(existing_reports or [])
        scores['reports'] = report_score
        weights['reports'] = 0.60
        
        # 2. Population Density Score (20% weight)
        density_score = self._estimate_population_density_score(
            lat_min, lat_max, lon_min, lon_max
        )
        scores['density'] = density_score
        weights['density'] = 0.20
        
        # 3. Time-based Score (20% weight)
        time_score = self._get_time_based_score()
        scores['time'] = time_score
        weights['time'] = 0.20
        
        # Calculate weighted average
        total_weighted_score = sum(
            scores[key] * weights[key] for key in scores.keys()
        )
        
        # Ensure score is between 0-10
        final_score = max(0.0, min(10.0, round(total_weighted_score, 1)))
        
        return final_score, {
            'breakdown': scores,
            'weights': weights,
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def _calculate_report_score(self, reports: List[Dict]) -> float:
        """Calculate safety score based on user reports"""
        if not reports:
            return 5.0  # Default neutral score
        
        report_weights = {
            "crime": 1.0,
            "accident": 2.0,
            "theft": 1.5,
            "harassment": 2.5,
            "road_damage": 3.0,
            "poor_visibility": 3.5,
            "lighting_problem": 4.0,
            "congestion": 5.0,
            "other": 5.0
        }
        
        if len(reports) > 20:
            return 2.0  # Too many reports = unsafe
        
        total_score = 0
        for report in reports:
            report_type = report.get('type', 'other').lower()
            score = report_weights.get(report_type, 5.0)
            total_score += score
        
        avg_score = total_score / len(reports)
        # Penalize high report frequency
        penalty = min(2.0, len(reports) * 0.1)
        return max(0.0, min(10.0, avg_score - penalty))
    
    def _estimate_population_density_score(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float
    ) -> float:
        """
        Estimate population density score.
        Higher density = more witnesses = safer
        """
        lat_diff = lat_max - lat_min
        lon_diff = lon_max - lon_min
        segment_size = lat_diff + lon_diff
        
        if segment_size < 0.002:
            return 7.5  # Urban
        elif segment_size < 0.005:
            return 6.5  # Suburban
        elif segment_size < 0.01:
            return 5.5  # Mixed
        else:
            return 4.0  # Rural
    
    def _get_time_based_score(self) -> float:
        """Calculate safety score based on time of day"""
        current_hour = datetime.now().hour
        
        if 22 <= current_hour or current_hour < 5:  # 10 PM - 5 AM
            return 4.0  # Night - less safe
        elif 5 <= current_hour < 6:  # 5-6 AM
            return 4.5  # Early morning
        elif 6 <= current_hour < 8:  # 6-8 AM
            return 6.0  # Morning commute
        elif 8 <= current_hour < 20:  # 8 AM - 8 PM
            return 7.5  # Peak daylight - safest
        elif 20 <= current_hour < 22:  # 8-10 PM
            return 6.5  # Evening
        
        return 5.5
    
    def get_safety_rating(self, score: float) -> str:
        """Convert numeric score to text rating"""
        if score >= 9:
            return "🟢 Very Safe"
        elif score >= 7:
            return "🟢 Safe"
        elif score >= 5:
            return "🟡 Moderate"
        elif score >= 3:
            return "🟠 Unsafe"
        else:
            return "🔴 Very Unsafe"


# Global instance
safety_service = SafetyDataService()
