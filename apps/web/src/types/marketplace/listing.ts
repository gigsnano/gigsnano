export enum EListingStatus {
  Open = "open",
  Awarded = "awarded",
  Closed = "closed",
}

export enum EBidStatus {
  Pending = "pending",
  Accepted = "accepted",
  Declined = "declined",
  Withdrawn = "withdrawn",
}

export enum EContractStatus {
  InProgress = "in_progress",
  Delivered = "delivered",
  Completed = "completed",
  Cancelled = "cancelled",
}

export interface IListing {
  id: string;
  workspace_id: string;
  story_id: string | null;
  cycle_id: string | null;
  project_id: string | null;
  title: string;
  description: string;
  status: EListingStatus;
  posted_by_id: string;
  created_at: string;
  bid_count: number;
}

export interface IBid {
  id: string;
  listing_id: string;
  bidder_id: string;
  bidder_name: string | null;
  amount_cents: number;
  message: string;
  delivery_days: number | null;
  status: EBidStatus;
  created_at: string;
}

export interface IContract {
  id: string;
  listing_id: string;
  bid_id: string;
  freelancer_id: string;
  workspace_id: string;
  workspace_slug: string | null;
  bid_cents: number;
  fee_cents: number;
  status: EContractStatus;
  delivered_at: string | null;
  completed_at: string | null;
  created_at: string;
  listing_title: string | null;
  project_id: string | null;
  story_id: string | null;
  cycle_id: string | null;
}

export interface IPublishListingPayload {
  story_id?: string | null;
  cycle_id?: string | null;
  title: string;
  description?: string;
}

export interface ICreateBidPayload {
  amount_cents: number;
  message?: string;
  delivery_days?: number | null;
}
