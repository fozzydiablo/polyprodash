import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from './card';
import OrderBook from './Orderbook';
import { Market, SubMarket, WSMessage} from '../../types/markets';
import Positions from './Positions';  // Add import

import { io, Socket } from 'socket.io-client';

interface SelectedMarketInfo {
  parentMarket: Market;
  subMarket: SubMarket;
}

export default function Markets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [filteredMarkets, setFilteredMarkets] = useState<Market[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarkets, setSelectedMarkets] = useState<SelectedMarketInfo[]>([]);
  const [showMarkets, setShowMarkets] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  const [userOrders, setUserOrders] = useState<Record<string, WSMessage[]>>({});

  const [loadingProgress, setLoadingProgress] = useState(0);
  const [marketsLoaded, setMarketsLoaded] = useState(0);
  const MAX_REQUESTS = 10; // Maximum number of requests to prevent infinite loops

  // Add state for positions panel
  const [showPositions, setShowPositions] = useState(false);

  // Using `useRef` to store socket instance
  const socketRef = useRef<Socket | null>(null);


  // Add these states at the top of your Markets component
  const [orderSize, setOrderSize] = useState<number>(1000);
  const [customSize, setCustomSize] = useState<string>('');
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');


  // Add this handler for custom size input
  const handleCustomSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setCustomSize(value);
      if (value !== '') {
        setOrderSize(parseInt(value));
      }
    }
  };

  useEffect(() => {
    // Initialize the socket only if it hasn't been initialized before
    if (!socketRef.current) {
      const newSocket = io('http://localhost:8000', {
        path: '/socket.io/',
        transports: ['websocket'],
        withCredentials: true,  // Try true or false to see if it resolves the issue
      });
      
      // Assign to the ref
      socketRef.current = newSocket;

      // Connection and error handlers
      newSocket.on('connect', () => {
        console.log('Connected to server');
        setWsConnected(true);
        setWsError(null);
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from server');
        setWsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setWsError('Failed to connect to server');
      });

      newSocket.on('user_update', (data: WSMessage[] | WSMessage) => {
        console.log('Markets - Received user update:', data);
        const messages = Array.isArray(data) ? data : [data];
        
        messages.forEach(message => {
          if (message.event_type === 'order') {
            setUserOrders(prev => {
              const tokenId = message.asset_id;
              const currentOrders = prev[tokenId] || [];
      
              switch (message.type) {
                case 'PLACEMENT':
                  // Add new order
                  return {
                    ...prev,
                    [tokenId]: [...currentOrders, message]
                  };
                  
                case 'UPDATE':
                  // Update the matched size of the order
                  const updatedOrders = currentOrders.map(order => {
                    if (order.id === message.id) {
                      // If fully matched, we'll filter it out later
                      return {
                        ...order,
                        size_matched: message.size_matched,
                        status: message.status
                      };
                    }
                    return order;
                  }).filter(order => 
                    // Remove orders that are fully matched
                    !(order.size_matched === order.original_size)
                  );
                  
                  console.log('Updating order match:', {
                    orderId: message.id,
                    sizeMatched: message.size_matched,
                    status: message.status
                  });
                  
                  return {
                    ...prev,
                    [tokenId]: updatedOrders
                  };
                  
                case 'CANCELLATION':
                  // Remove canceled order
                  return {
                    ...prev,
                    [tokenId]: currentOrders.filter(order => order.id !== message.id)
                  };
                  
                default:
                  return prev;
              }
            });
          }
        });
      });

      newSocket.on('connection_status', (status: { connected: boolean }) => {
        console.log('Connection status:', status);
        setWsConnected(status.connected);
      });
    }

    // Cleanup on component unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const fetchAllMarkets = async () => {
      try {
        let allMarkets: Market[] = [];
        let offset = 0;
        const limit = 400;
        let requestCount = 0;
        
        while (requestCount < MAX_REQUESTS) {
          try {
            const response = await fetch(
              `http://localhost:8000/api/markets?limit=${limit}&active=true&archived=false&closed=false&offset=${offset}`
            );
            
            if (!response.ok) {
              console.error('Fetch error:', response.status, response.statusText);
              const errorText = await response.text();
              console.error('Error response:', errorText);
              throw new Error(`Failed to fetch markets: ${response.status}`);
            }
  
            const jsonData = await response.json();
            console.log(`Received ${jsonData.length} markets`);
            
          // Debug the structure of the first market
          if (jsonData.length > 0 && requestCount === 0) {
            console.log('Sample market structure:', {
              id: jsonData[0].id,
              title: jsonData[0].title,
              markets: jsonData[0].markets,
              icon: jsonData[0].icon,
              volume24hr: jsonData[0].volume24hr
            });
          }
  
            allMarkets = [...allMarkets, ...jsonData];
            offset += limit;
            requestCount++;
  
            // Update progress
            setMarketsLoaded(allMarkets.length);
            setLoadingProgress((requestCount / MAX_REQUESTS) * 100);
            
            // Update markets as we get them
            setMarkets(allMarkets);
            setFilteredMarkets(allMarkets);
  
            // Add delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
  
          } catch (err) {
            console.error('Error in fetch iteration:', err);
            break; // Break the loop if we hit an error
          }
        }
  
        // Set final state
        setMarkets(allMarkets);
        setFilteredMarkets(allMarkets);
        
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch markets');
      } finally {
        setLoading(false);
      }
    };
  
    fetchAllMarkets();
  }, []);

  // Filter markets based on search
  useEffect(() => {
    const filtered = markets.filter(market =>
      market.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredMarkets(filtered);
  }, [searchTerm, markets]);

  const formatVolume = (volume: number | undefined | null) => {
    if (!volume) return '$0.00 Vol.';  // Handle undefined, null, or 0
  
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(1)}b Vol.`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(1)}m Vol.`;
    if (volume >= 1e3) return `$${(volume / 1e3).toFixed(1)}k Vol.`;
    return `$${volume.toFixed(1)} Vol.`;
  };

  // First, remove the limit from sortAndLimitSubMarkets function
  const sortSubMarkets = (markets: SubMarket[]) => {
    return markets
      .map(market => ({
        ...market,
        topOutcomeValue: parseFloat(JSON.parse(market.outcomePrices || '["0","0"]')[0])
      }))
      .sort((a, b) => b.topOutcomeValue - a.topOutcomeValue);
  };

  const handleSubMarketSelect = (parentMarket: Market, subMarket: SubMarket) => {
    setSelectedMarkets(prev => {
      const existingIndex = prev.findIndex(
        selected => selected.subMarket.id === subMarket.id
      );
      
      if (existingIndex >= 0) {
        return prev.filter((_, index) => index !== existingIndex);
      } else {
        return [...prev, { parentMarket, subMarket }];
      }
    });
  };

  const isSubMarketSelected = (subMarketId: string): boolean => {
    return selectedMarkets.some(selected => selected.subMarket.id === subMarketId);
  };

// First, handle loading and error states
if (loading) {
  return (
    <div className="w-full h-screen bg-[#1D2B39] text-white flex flex-col items-center justify-center">
      <div className="text-lg mb-4">Loading markets...</div>
      <div className="w-64 bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div 
          className="bg-blue-500 h-2.5 transition-all duration-500"
          style={{ width: `${loadingProgress}%` }}
        />
      </div>
      <div className="text-sm text-gray-400 mt-2">
        {marketsLoaded} markets loaded
      </div>
    </div>
  );
}

if (error) {
  return (
    <div className="w-full h-screen bg-[#1D2B39] text-white flex items-center justify-center">
      <div className="text-lg text-red-500">Error: {error}</div>
    </div>
  );
}

// Main return with sticky header
return (
  <div className="w-full bg-[#1D2B39] min-h-screen">
    {/* Sticky Header */}
    <div className="sticky top-0 z-50 bg-[#1D2B39] border-b border-[#2C3F50] shadow-lg">
      <div className="max-w-[1920px] mx-auto px-6">
        <div className="py-4">
          <h1 className="text-2xl font-bold text-white mb-6">PolyPro</h1>
          
          <div className="mb-6 flex items-center gap-3">
            {/* Search Input */}
            <input
              type="text"
              placeholder="Search markets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-1/4 px-4 py-3 rounded-lg bg-[#2C3F50] border-none text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            {/* Size Control Buttons */}
            <div className="flex items-center gap-2">
              {[1000, 10000].map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setOrderSize(size);
                    setCustomSize('');
                  }}
                  className={`px-4 py-3 rounded-lg transition-colors ${
                    orderSize === size && customSize === ''
                      ? 'bg-blue-500 text-white'
                      : 'bg-[#2C3F50] text-gray-300 hover:bg-[#364E65]'
                  }`}
                >
                  {size.toLocaleString()}
                </button>
              ))}
              
              {/* Custom Size Input */}
              <input
                type="text"
                placeholder="Custom size"
                value={customSize}
                onChange={handleCustomSizeChange}
                className={`w-24 px-4 py-3 rounded-lg border-none text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center transition-colors ${
                  customSize !== '' 
                    ? 'bg-blue-500' 
                    : 'bg-[#2C3F50] hover:bg-[#364E65]'
                }`}
                onFocus={(e) => {
                  if (customSize === '') {
                    setCustomSize(orderSize.toString());
                  }
                }}
              />

              {/* Buy/Sell Toggle Buttons */}
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={() => setOrderSide('BUY')}
                  className={`px-4 py-3 rounded-lg transition-colors ${
                    orderSide === 'BUY'
                      ? 'bg-green-500 text-white ring-2 ring-green-400'
                      : 'bg-[#2C3F50] text-gray-300 hover:bg-[#364E65]'
                  }`}
                >
                  Buy
                </button>
                <button
                  onClick={() => setOrderSide('SELL')}
                  className={`px-4 py-3 rounded-lg transition-colors ${
                    orderSide === 'SELL'
                      ? 'bg-red-500 text-white ring-2 ring-red-400'
                      : 'bg-[#2C3F50] text-gray-300 hover:bg-[#364E65]'
                  }`}
                >
                  Sell
                </button>
              </div>
            </div>

            {/* Show/Hide Markets Button */}
            <button
              onClick={() => setShowMarkets(!showMarkets)}
              className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              {showMarkets ? 'Hide Markets' : 'Show Markets'}
            </button>

            {/* Show/Hide Positions Button */}
            <button
              onClick={() => setShowPositions(!showPositions)}
              className={`px-4 py-3 rounded-lg transition-colors ${
                showPositions 
                  ? 'bg-green-500 hover:bg-green-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
              } text-white`}
            >
              {showPositions ? 'Hide Positions' : 'Show Positions'}
            </button>
            
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <span 
                className={`h-2.5 w-2.5 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}
                title={wsConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
              />
              {wsError && (
                <span className="text-red-400 text-xs">{wsError}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Main Content Area */}
    <div className="max-w-[1920px] mx-auto px-6">
      <div className="relative">
        {/* Positions Panel */}
        <div 
          className={`fixed left-0 h-[calc(100vh-200px)] w-80 bg-[#2C3F50] transform transition-transform duration-300 ease-in-out ${
            showPositions ? 'translate-x-0' : '-translate-x-full'
          } z-40 overflow-y-auto`}
          style={{ top: '160px' }}
        >
          <Positions isOpen={showPositions} />
        </div>

        {/* Markets and OrderBooks Content */}
        <div className={`transition-all duration-300 ${showPositions ? 'ml-80' : 'ml-0'}`}>
          {/* Markets Section */}
          {showMarkets && (
            <div className="relative">
              <div className="overflow-x-auto pb-4 hide-scrollbar">
                <div className="flex gap-4">
                  {filteredMarkets.map((market) => (
                    <Card 
                      key={market.id} 
                      className="flex-shrink-0 w-[200px] bg-[#2C3F50] text-white hover:bg-[#364E65] transition-colors relative"
                    >
                      <CardContent className="p-4 flex flex-col h-[280px]">
              {/* Header Section */}
              <div className="flex items-start gap-2 mb-3 flex-shrink-0">
                <img
                  src={market.icon}
                  alt=""
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder.png';
                  }}
                />
                <h2 className="text-sm font-semibold leading-tight">
                  {market.title}
                </h2>
              </div>
            
              {/* Scrollable SubMarkets Section */}
              <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-[#364E65] scrollbar-track-transparent hover:scrollbar-thumb-[#405B7A] pr-2">
                {sortSubMarkets(market.markets || []).map((subMarket) => {
                  const prices = JSON.parse(subMarket.outcomePrices || '["0","0"]');
                  const percentage = (Number(prices[0]) * 100).toFixed(0);
                  const isSelected = isSubMarketSelected(subMarket.id);
                  
                  return (
                    <div 
                      key={subMarket.id}
                      onClick={() => handleSubMarketSelect(market, subMarket)}
                      className={`
                        flex justify-between items-center mb-1.5 p-1.5 rounded 
                        cursor-pointer transition-all duration-200 text-xs
                        ${isSelected ? 'bg-[#364E65] ring-2 ring-blue-500' : 'hover:bg-[#364E65]'}
                        hover:transform hover:scale-[1.02] hover:shadow-lg
                      `}
                    >
                      <span className="text-gray-300">{subMarket.groupItemTitle}</span>
                      <span className="font-semibold text-white">
                        {percentage}%
                      </span>
                    </div>
                  );
                })}
              </div>
            
              {/* Footer Section */}
              <div className="mt-3 pt-3 border-t border-gray-700 text-gray-400 text-xs flex-shrink-0">
                {formatVolume(market.volume24hr)}
              </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* OrderBooks Section */}
          <div className="flex flex-wrap space-x-2 gap-y-4 mt-4">
            {selectedMarkets.map((selected) => (
              <div 
                key={selected.subMarket.id} 
                style={{ width: '300px' }}
                className="shrink-0 first:ml-2"
              >
                <OrderBook
                  parentMarket={selected.parentMarket}
                  subMarket={selected.subMarket}
                  wsConnected={wsConnected}
                  wsError={wsError}
                  userOrders={[
                    ...(userOrders[JSON.parse(selected.subMarket.clobTokenIds)[0]] || []),
                    ...(userOrders[JSON.parse(selected.subMarket.clobTokenIds)[1]] || [])
                  ]}
                  orderSize={orderSize}
                  orderSide={orderSide}
                  onClose={() => {
                    setSelectedMarkets(prev => 
                      prev.filter(sm => sm.subMarket.id !== selected.subMarket.id)
                    );
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);
}
