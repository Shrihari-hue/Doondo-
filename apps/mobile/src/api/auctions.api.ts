/** Live Job Auction — urgent gigs with time-boxed bids. */
import { apiRequest } from './client';

export interface Auction {
  id: string;
  jobId: string;
  jobTitle: string;
  employerName: string;
  employerLateCancels: number;
  maxPaise: number;
  endsAt: string;
  status: 'live' | 'awarded' | 'closed' | 'cancelled';
  bidCount: number;
  lowestBidPaise: number | null;
  myBid: { amountPaise: number; etaMinutes: number; status: string } | null;
  distanceMeters?: number;
}
export interface AuctionBid {
  id: string;
  seekerId: string;
  name: string;
  photoUrl: string | null;
  isVerified: boolean;
  amountPaise: number;
  etaMinutes: number;
  status: string;
}

export const auctionsApi = {
  nearby: (lat: number, lng: number) =>
    apiRequest<{ auctions: Auction[] }>(`/auctions/nearby?lat=${lat}&lng=${lng}`).then((r) => r.auctions),
  bid: (id: string, amountPaise: number, etaMinutes: number) =>
    apiRequest<{ auction: Auction }>(`/auctions/${id}/bids`, { method: 'POST', body: { amountPaise, etaMinutes } }).then((r) => r.auction),
  withdraw: (id: string) => apiRequest<{ withdrawn: boolean }>(`/auctions/${id}/bids`, { method: 'DELETE' }),
  // employer
  mine: () => apiRequest<{ auctions: Auction[] }>('/auctions/mine').then((r) => r.auctions),
  start: (jobId: string, maxPaise: number, durationMinutes: number) =>
    apiRequest<{ auction: Auction }>('/auctions', { method: 'POST', body: { jobId, maxPaise, durationMinutes } }).then((r) => r.auction),
  get: (id: string) => apiRequest<{ auction: Auction; bids: AuctionBid[] }>(`/auctions/${id}`),
  award: (id: string, bidId: string) =>
    apiRequest<{ applicationId: string }>(`/auctions/${id}/award`, { method: 'POST', body: { bidId } }),
  cancel: (id: string) => apiRequest<{ cancelled: boolean }>(`/auctions/${id}/cancel`, { method: 'POST', body: {} }),
};
