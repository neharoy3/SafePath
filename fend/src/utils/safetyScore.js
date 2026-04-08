/**
 * Calculate safety score based on various factors
 * @param {Object} routeData - Route data with safety metrics
 * @returns {Object} - Safety score and category
 */
export const calculateSafetyScore = (routeData) => {
  const { lighting = 5, policePresence = 5, activeUsers = 5, traffic = 5, distance = 5 } = routeData

  // Safety Score Formula
  const L = Math.min(10, Math.max(0, lighting))
  const P = Math.min(10, Math.max(0, policePresence))
  const U = Math.min(10, Math.max(0, activeUsers))
  const T = Math.min(10, Math.max(0, traffic))
  const D = distance // in km

  const safetyScore = 
    (L * 0.25) + 
    (P * 0.25) + 
    (U * 0.25) + 
    ((10 - T) * 0.15) + 
    ((10 - D / 2) * 0.10)

  // Categorize route
  let category = 'risky'
  let color = 'red'
  let tag = 'Avoid'

  if (safetyScore >= 8.0) {
    category = 'safe'
    color = 'green'
    tag = 'Recommended'
  } else if (safetyScore >= 6.0) {
    category = 'moderate'
    color = 'yellow'
    tag = 'Quickest'
  } else if (activeUsers >= 7) {
    // High user density can make a route acceptable even with lower score
    category = 'moderate'
    color = 'yellow'
    tag = 'Popular'
  }

  return {
    score: parseFloat(safetyScore.toFixed(2)),
    category,
    color,
    tag,
    metrics: { L, P, U, T, D }
  }
}

/**
 * Generate mock route data
 */
export const generateMockRoutes = (source, destination) => {
  return [
    {
      id: 'route-1',
      name: 'Safe Route',
      source,
      destination,
      distance: 6.2,
      eta: 16,
      lighting: 9,
      policePresence: 8,
      activeUsers: 7,
      traffic: 4,
      path: [] // Will be populated with map coordinates
    },
    {
      id: 'route-2',
      name: 'Shortest Route',
      source,
      destination,
      distance: 5.8,
      eta: 14,
      lighting: 6,
      policePresence: 5,
      activeUsers: 5,
      traffic: 6,
      path: []
    },
    {
      id: 'route-3',
      name: 'Risky Route',
      source,
      destination,
      distance: 7.1,
      eta: 18,
      lighting: 4,
      policePresence: 3,
      activeUsers: 8,
      traffic: 3,
      path: []
    }
  ].map(route => ({
    ...route,
    safety: calculateSafetyScore(route)
  }))
}

