export interface SubMarket {
    id: string;
    question: string;
    conditionId: string;
    slug: string;
    resolutionSource: string;
    endDate: string;
    liquidity: string;
    startDate: string;
    fee: string;
    image: string;
    icon: string;
    description: string;
    outcomes: string;
    outcomePrices: string;
    volume: string;
    active: boolean;
    marketType: string;
    closed: boolean;
    marketMakerAddress: string;
    groupItemTitle: string;
    volume24hr: number;
    volumeNum: number;
    liquidityNum: number;
    clobTokenIds: string;
  }
  
  export interface Market {
    id: string;
    ticker: string;
    slug: string;
    title: string;
    description: string;
    resolutionSource: string;
    startDate: string;
    creationDate: string;
    endDate: string;
    image: string;
    icon: string;
    active: boolean;
    closed: boolean;
    archived: boolean;
    new: boolean;
    featured: boolean;
    restricted: boolean;
    liquidity: number;
    volume: number;
    volume24hr: number;
    markets: SubMarket[];
  }

  export interface OrderResponse {
    errorMsg: string;
    orderID: string;
    takingAmount: string;
    makingAmount: string;
    status: string;
    transactionsHashes: string[];
    success: boolean;
  }
  
  export interface OrderStatus {
    price: number;
    size: number;
    response: OrderResponse;
    timestamp: number;
  }

  export interface OrderResponse {
    status: string;
    size_matched: string;
    original_size: string;
    side: string;
    price: string;
    type: string;
    // ... other fields
  }

  export interface WSMessage {
    asset_id: string;
    associate_trades: any;
    created_at: string;
    event_type: string;
    expiration: string;
    id: string;
    maker_address: string;
    market: string;
    order_owner: string;
    order_type: string;
    original_size: string;
    outcome: string;
    owner: string;
    price: string;
    side: string;
    size_matched: string;
    status: string;
    timestamp: string;
    type: string;
  }

  // Add these new interfaces at the top
export interface Positions {
  // Add position properties based on the API response
  marketId: string;
  outcomeId: string;
  size: number;
  price: number;
  // Add other properties as needed
}