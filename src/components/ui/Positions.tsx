import React from 'react';
import { useEffect, useState, useRef } from 'react';
import { ArrowUpDown, RotateCw } from 'lucide-react';

interface Position {
  proxyWallet: string;
  asset: string;
  title: string;
  size: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  outcome: string;
  avgPrice: number;
  curPrice: number;
}

interface PositionsProps {
  isOpen: boolean;
}

const Positions: React.FC<PositionsProps> = ({ isOpen }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/positions');
      if (!response.ok) {
        throw new Error('Failed to fetch positions');
      }
      const data = await response.json();
      const sortedData = data.sort((a: Position, b: Position) => b.currentValue - a.currentValue);
      setPositions(sortedData);
      setLastUpdateTime(new Date());
    } catch (error) {
      console.error('Error fetching positions:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch positions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Initial fetch
      fetchPositions();

      // Set up interval for auto-updates
      updateIntervalRef.current = setInterval(fetchPositions, 20000);
    }

    // Cleanup function
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    };
  }, [isOpen]);

  const formatPnL = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <div 
      className={`fixed left-0 top-0 h-full w-80 bg-[#2C3F50] transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } z-50 overflow-y-auto`}
    >
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Positions</h2>
            {lastUpdateTime && (
              <div className="text-xs text-gray-400">
                Last updated: {lastUpdateTime.toLocaleTimeString()}
              </div>
            )}
          </div>
          <button
            onClick={fetchPositions}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-[#364E65]"
            title="Refresh positions"
          >
            <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {error ? (
          <div className="text-red-400 text-center py-4">{error}</div>
        ) : (
          <div className="space-y-3">
            {positions.map((position, index) => (
              <div 
                key={position.asset + index}
                className="bg-[#364E65] rounded-lg p-3 text-white hover:bg-[#405B7A] transition-colors"
              >
                {/* Title and Outcome */}
                <div className="flex items-start justify-between mb-2">
                  <div className="text-sm font-medium flex-1 pr-2">{position.title}</div>
                  <div className={`text-xs px-2 py-0.5 rounded ${
                    position.outcome === 'Yes' ? 'bg-green-600' : 'bg-red-600'
                  }`}>
                    {position.outcome}
                  </div>
                </div>

                {/* Size */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold">Size: {position.size}</span>
                  <span className="text-xs text-gray-400">
                    @ ${position.avgPrice.toFixed(3)}
                  </span>
                </div>

                {/* Value and PnL */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-baseline gap-2">
                    <span>${position.currentValue.toFixed(2)}</span>
                    <span className={position.cashPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {formatPnL(position.cashPnl)}
                    </span>
                  </div>
                  <span className={`text-xs ${
                    position.percentPnl >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    ({formatPercentage(position.percentPnl)})
                  </span>
                </div>
              </div>
            ))}
            {positions.length === 0 && (
              <div className="text-gray-400 text-center py-4">
                No positions found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Positions;