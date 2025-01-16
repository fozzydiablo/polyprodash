import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './card';
import { X } from 'lucide-react';
import { Market, SubMarket, OrderResponse, WSMessage } from '../../types/markets';


interface OrderBookProps {
  parentMarket: Market;
  subMarket: SubMarket;
  wsConnected: boolean;
  wsError: string | null;
  orderSize: number;
  orderSide: 'BUY' | 'SELL';
  userOrders?: WSMessage[]; // Add this to pass user order updates
  onClose: () => void;
}

type OrderType = [number, number]; // [price, size]

interface BookEvent {
  asks: { price: string; size: string }[];
  bids: { price: string; size: string }[];
  asset_id: string;
  event_type: string;
  hash: string;
  market: string;
  timestamp: string;
}

interface PriceChange {
  price: string;
  side: 'BUY' | 'SELL';
  size: string;
}

interface PriceChangeEvent {
  asset_id: string;
  changes: PriceChange[];
  event_type: string;
  market: string;
  timestamp: string;
}

type WebSocketEvent = BookEvent | PriceChangeEvent;

const OrderBook: React.FC<OrderBookProps> = ({ 
  parentMarket, 
  subMarket, 
  wsConnected, 
  wsError,
  userOrders = [], // Default to empty array
  orderSize,
  orderSide,
  onClose 
}) => {
  const [bids, setBids] = useState<OrderType[]>([]);
  const [asks, setAsks] = useState<OrderType[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGrouped, setIsGrouped] = useState(false);
  const [placingOrderPrice, setPlacingOrderPrice] = useState<number | null>(null);
  const [activeTokenId, setActiveTokenId] = useState<string>('');
  const [outcomes, setOutcomes] = useState<string[]>([]);

  const [orderError, setOrderError] = useState<string | null>(null);



  const filteredOrders = userOrders.filter(order => 
    order.type === "PLACEMENT" && 
    order.status === "LIVE" &&
    order.asset_id === activeTokenId &&
    order.size_matched !== order.original_size // Only show orders that aren't fully matched
  );

  useEffect(() => {
    const tokenIds = JSON.parse(subMarket.clobTokenIds);
    const outcomes = JSON.parse(subMarket.outcomes);
    setActiveTokenId(tokenIds[0]); // Set initial active token ID
    setOutcomes(outcomes);
  }, [subMarket]);

  const handleRowClick = async (price: number) => {
    try {
      setOrderError(null);
      setPlacingOrderPrice(price);
      
      const response = await fetch('http://localhost:8000/api/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          token_id: activeTokenId,
          price: price,
          size: orderSize,
          side: orderSide
        })
      });
  
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || `Failed to place ${orderSide.toLowerCase()} order`);
      }
    } catch (error) {
      console.error('Error placing order:', error);
      setOrderError(error instanceof Error ? error.message : 'Failed to place order');
    } finally {
      setPlacingOrderPrice(null);
    }
  };
  
  // Add error display in the CardContent:
  {orderError && (
    <div className="mt-2 p-2 bg-red-500 bg-opacity-20 text-red-400 rounded text-xs">
      {orderError}
    </div>
  )}

  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(1)}¢`;
  };

  const formatShares = (size: number): string => {
    return size.toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatTotal = (total: number): string => {
    return `$${total.toLocaleString('en-US', { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const flattenArray = (array: any[]): any[] => {
    return array.reduce((acc, val) => acc.concat(val), []);
  };

  const processData = (orders: OrderType[], isGrouped: boolean): OrderType[] => {
    if (!isGrouped) return orders;

    const grouped: { [key: number]: OrderType } = {};
    orders.forEach(([price, size]) => {
      const intPrice = Math.floor(price);
      if (grouped[intPrice]) {
        grouped[intPrice][1] += size;
      } else {
        grouped[intPrice] = [price, size];
      }
    });

    return Object.values(grouped).sort((a, b) => b[0] - a[0]);
  };

// Add separate state for each asset ID's orders
interface OrderState {
  bids: OrderType[];
  asks: OrderType[];
}

const [orderBooks, setOrderBooks] = useState<Record<string, OrderState>>({});

// Update the processOrderBook function to handle both token IDs
const processOrderBook = useCallback((data: WebSocketEvent[]) => {
  data.forEach((event) => {
    if (event.event_type === 'book') {
      const bookEvent = event as BookEvent;
      const assetId = event.asset_id;

      const flattenedAsks = flattenArray(bookEvent.asks);
      const flattenedBids = flattenArray(bookEvent.bids);

      const formattedBids = flattenedBids.map(bid => [
        parseFloat(bid.price),
        parseFloat(bid.size)
      ] as OrderType);

      const formattedAsks = flattenedAsks.map(ask => [
        parseFloat(ask.price),
        parseFloat(ask.size)
      ] as OrderType);

      setOrderBooks(prev => ({
        ...prev,
        [assetId]: {
          bids: formattedBids.sort((a, b) => b[0] - a[0]),
          asks: formattedAsks.sort((a, b) => a[0] - b[0])
        }
      }));
    }
  });
}, []);

useEffect(() => {
  console.log('OrderBook - userOrders prop changed:', userOrders);
}, [userOrders]);

useEffect(() => {
  console.log('OrderBook - activeTokenId changed:', activeTokenId);
}, [activeTokenId]);

const handleCancelOrder = async (orderId: string) => {
  try {
    const response = await fetch('http://localhost:8000/api/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        order_id: orderId
      })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || 'Failed to cancel order');
    }

    // Optional: Add success handling here
    console.log('Order cancelled successfully');
  } catch (error) {
    console.error('Error cancelling order:', error);
    // Optional: Add error handling here
  }
};

// Update the render section to use the active orderbook
const activeOrderBook = orderBooks[activeTokenId] || { bids: [], asks: [] };

useEffect(() => {
  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout;
  let keepaliveInterval: NodeJS.Timeout;
  let isComponentMounted = true;

  const connect = () => {
    try {
      if (ws) {
        ws.close();
      }

      ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');

      ws.onopen = () => {
        if (!isComponentMounted) return;
        
        setConnected(true);
        setError(null);
        
        try {
          const tokenIds = JSON.parse(subMarket.clobTokenIds);
          const message = {
            assets_ids: tokenIds,
            sequence_number: 0
          };
          console.log(`Subscribing to market ${subMarket.groupItemTitle}:`, message);
          ws.send(JSON.stringify(message));

          // Set up keepalive interval
          keepaliveInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'keepalive' }));
              console.log('Sent keepalive message');
            }
          }, 30000); // Send keepalive every 45 seconds

        } catch (err) {
          console.error('Error parsing clobTokenIds:', err);
          setError('Error setting up orderbook subscription');
        }
      };

      ws.onmessage = (event) => {
        if (!isComponentMounted) return;
        
        try {

          // Check if the message is a PONG response
          if (event.data === "PONG") {
            console.debug('Received PONG from server');
            return;
          }
          const data = JSON.parse(event.data);
          console.log(data)
          if (Array.isArray(data)) {
            data.forEach(event => {
              if (event.event_type === 'book') {
                const bookEvent = event as BookEvent;
                const assetId = event.asset_id;
                

                setOrderBooks(prev => {
                  const asks = bookEvent.asks.map(ask => [
                    parseFloat(ask.price),
                    parseFloat(ask.size)
                  ] as OrderType);

                  const bids = bookEvent.bids.map(bid => [
                    parseFloat(bid.price),
                    parseFloat(bid.size)
                  ] as OrderType);

                  return {
                    ...prev,
                    [assetId]: {
                      asks: asks.sort((a, b) => a[0] - b[0]),
                      bids: bids.sort((a, b) => b[0] - a[0])
                    }
                  };
                });
              } else if (event.event_type === 'changes') {
                const changeEvent = event as PriceChangeEvent;
                const assetId = changeEvent.asset_id;
                

                setOrderBooks(prev => {
                  const currentBook = prev[assetId] || { asks: [], bids: [] };
                  const newBook = { ...currentBook };

                  changeEvent.changes.forEach(change => {
                    const price = parseFloat(change.price);
                    const size = parseFloat(change.size);

                    if (change.side === 'SELL') {
                      if (size === 0) {
                        newBook.asks = newBook.asks.filter(ask => ask[0] !== price);
                      } else {
                        const existingIndex = newBook.asks.findIndex(ask => ask[0] === price);
                        if (existingIndex >= 0) {
                          newBook.asks[existingIndex] = [price, size];
                        } else {
                          newBook.asks.push([price, size]);
                          newBook.asks.sort((a, b) => a[0] - b[0]);
                        }
                      }
                    } else {
                      if (size === 0) {
                        newBook.bids = newBook.bids.filter(bid => bid[0] !== price);
                      } else {
                        const existingIndex = newBook.bids.findIndex(bid => bid[0] === price);
                        if (existingIndex >= 0) {
                          newBook.bids[existingIndex] = [price, size];
                        } else {
                          newBook.bids.push([price, size]);
                          newBook.bids.sort((a, b) => b[0] - a[0]);
                        }
                      }
                    }
                  });

                  return {
                    ...prev,
                    [assetId]: newBook
                  };
                });
              }
            });
          } else if (data.event_type) {
            processOrderBook([data]);
          }
        } catch (error) {
          console.error(`Error processing message for ${subMarket.groupItemTitle}:`, error);
        }
      };

      ws.onclose = (event) => {
        if (!isComponentMounted) return;
        
        setConnected(false);
        clearInterval(keepaliveInterval); // Clear keepalive on connection close
        
        if (isComponentMounted && event.code !== 1000) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };

      ws.onerror = (error) => {
        if (!isComponentMounted) return;
        console.error(`WebSocket error for ${subMarket.groupItemTitle}:`, error);
        setError('Connection error');
      };

    } catch (error) {
      if (!isComponentMounted) return;
      console.error(`Failed to connect for ${subMarket.groupItemTitle}:`, error);
      setError('Failed to connect');
    }
  };

  connect();

  // Cleanup function
  return () => {
    isComponentMounted = false;
    clearTimeout(reconnectTimeout);
    clearInterval(keepaliveInterval);
    
    if (ws) {
      ws.close(1000, 'Component unmounted');
      ws = null;
    }
  };
}, [subMarket.clobTokenIds, subMarket.groupItemTitle, processOrderBook]);

  return (
    <Card className="bg-[#2C3F50] text-white text-xs rounded-xl" style={{ width: '300px', minHeight: '500px' }}>
      <CardHeader className="p-4 flex flex-col gap-1">
        <span className="text-sm font-semibold text-gray-400 truncate">{parentMarket.title}</span>
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-white truncate">{subMarket.groupItemTitle}</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {outcomes.map((outcome, index) => {
                const tokenIds = JSON.parse(subMarket.clobTokenIds);
                return (
                  <button
                    key={tokenIds[index]}
                    onClick={() => setActiveTokenId(tokenIds[index])}
                    className={`px-2 py-1 rounded text-xs ${
                      activeTokenId === tokenIds[index]
                        ? 'bg-blue-500 text-white'
                        : 'bg-[#364E65] text-gray-300 hover:bg-[#425a75]'
                    }`}
                  >
                    {outcome}
                  </button>
                );
              })}
            </div>
            <span 
              className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} 
              title={connected ? 'Connected' : 'Disconnected'}
            />
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </CardHeader>
  
      <CardContent className="p-4">
        <div className="grid grid-cols-[70px_90px_1fr] gap-[4px_10px] mb-3 text-gray-400 font-semibold">
          <div className="text-center">PRICE</div>
          <div className="text-center">SHARES</div>
          <div className="text-center">TOTAL</div>
        </div>
  
        <div className="space-y-0.5">
        {processData(orderBooks[activeTokenId]?.asks?.slice().reverse() || [], isGrouped)
            .slice(-7)
            .map((ask, i, array) => {
              const total = array
                .slice(i)
                .reduce((sum, [price, size]) => sum + (price * size), 0);
              
              const isPlacingOrder = placingOrderPrice === ask[0];
              const hasActiveOrder = filteredOrders.some(
                order => Number(order.price) === ask[0] && order.side === 'SELL'
              );

              return (
                <div 
                  key={`ask-${ask[0]}-${i}`} 
                  onClick={() => !isPlacingOrder && handleRowClick(ask[0])}
                  className={`
                    grid grid-cols-[70px_90px_1fr] gap-[4px_10px] py-1 
                    text-red-400 hover:bg-[#364E65] rounded cursor-pointer
                    ${isPlacingOrder ? 'opacity-50 animate-pulse' : ''}
                    ${hasActiveOrder ? 'bg-red-500 bg-opacity-20 ring-1 ring-red-500' : ''}
                  `}
                >
                  <div className="text-left">
                    {formatPrice(ask[0])}
                    {isPlacingOrder && <span className="ml-1">...</span>}
                  </div>
                  <div className="text-right">{formatShares(ask[1])}</div>
                  <div className="text-right">{formatTotal(total)}</div>
                </div>
              );
            })}
          </div>
  
        <div className="my-2 border-t border-gray-600" />
  
        <div className="space-y-0.5">
        {processData(orderBooks[activeTokenId]?.bids || [], isGrouped)
            .slice(0, 7)
            .map((bid, i, array) => {
              const total = array
                .slice(0, i + 1)
                .reduce((sum, [price, size]) => sum + (price * size), 0);
              
              const isPlacingOrder = placingOrderPrice === bid[0];
              const hasActiveOrder = filteredOrders.some(
                order => Number(order.price) === bid[0] && order.side === 'BUY'
              );

              return (
                <div 
                  key={`bid-${bid[0]}-${i}`} 
                  className={`
                    grid grid-cols-[70px_90px_1fr] gap-[4px_10px] py-1 
                    text-green-400 hover:bg-[#364E65] rounded cursor-pointer
                    ${isPlacingOrder ? 'opacity-50 animate-pulse' : ''}
                    ${hasActiveOrder ? 'bg-green-500 bg-opacity-20 ring-1 ring-green-500' : ''}
                  `}
                  onClick={() => !isPlacingOrder && handleRowClick(bid[0])}
                >
                  <div className="text-left">
                    {formatPrice(bid[0])}
                    {isPlacingOrder && <span className="ml-1">...</span>}
                  </div>
                  <div className="text-right">{formatShares(bid[1])}</div>
                  <div className="text-right">{formatTotal(total)}</div>
                </div>
              );
            })}
        </div>
  
        
<div className="mt-4 border-t border-gray-600 pt-4">
  <div className="space-y-2">
    {filteredOrders.map((order) => (
      <div 
        key={order.id}
        className="flex items-center justify-between p-2 rounded bg-[#364E65] hover:bg-[#405B7A] transition-colors"
      >
        <div className="flex items-center space-x-2 flex-grow">
          <div className="flex-grow">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1">
                <span>{formatPrice(Number(order.price))}</span>
                <span className="text-gray-400">
                  {Number(order.size_matched)} / {Number(order.original_size)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  order.side === 'BUY' ? 'bg-green-600' : 'bg-red-600'
                }`}>
                  {order.side}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelOrder(order.id);
                  }}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="w-full bg-gray-600 h-1 rounded-full mt-1">
              <div 
                className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                style={{ 
                  width: `${(Number(order.size_matched) / Number(order.original_size)) * 100}%` 
                }}
              />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
</div>
      </CardContent>
    </Card>
  );
};

export default OrderBook;