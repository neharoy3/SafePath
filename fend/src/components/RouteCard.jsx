const RouteCard = ({ route, onClick, isSelected }) => {
  const { name, distance, eta, safety } = route

  const getColorClasses = (color) => {
    switch (color) {
      case 'green':
        return 'border-neon-green shadow-glow-green'
      case 'yellow':
        return 'border-neon-yellow shadow-glow-yellow'
      case 'red':
        return 'border-neon-red shadow-glow-red'
      default:
        return 'border-gray-600'
    }
  }

  const getTagBg = (color) => {
    switch (color) {
      case 'green':
        return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'yellow':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
      case 'red':
        return 'bg-red-500/20 text-red-400 border-red-500/50'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50'
    }
  }

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isSelected ? getColorClasses(safety.color) : 'border-gray-700 hover:border-gray-600'
      } bg-dark-bg hover:bg-dark-surface/50`}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-white font-semibold">{name}</h4>
        <span className={`px-2 py-1 rounded text-xs font-medium border ${getTagBg(safety.color)}`}>
          {safety.tag}
        </span>
      </div>

      <div className="flex items-center space-x-4 text-sm text-gray-400 mb-2">
        <span>{eta} min</span>
        <span>•</span>
        <span>{distance} km</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">Safety Score:</span>
          <span className={`text-sm font-semibold ${
            safety.color === 'green' ? 'text-green-400' :
            safety.color === 'yellow' ? 'text-yellow-400' :
            'text-red-400'
          }`}>
            {safety.score}/10
          </span>
        </div>
      </div>
    </div>
  )
}

export default RouteCard

