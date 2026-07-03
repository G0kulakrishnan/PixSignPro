export interface AdminUser {
  id: string;
  name: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingPeriod: 'monthly' | 'quarterly' | 'yearly';
  maxUsers: number;
  maxStorageMb: number;
  maxImages: number;
  maxVideos: number;
  features: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface Business {
  id: string;
  name: string;
  agencyName: string | null;
  city: string | null;
  website: string | null;
  logoUrl: string | null;
  planId: string | null;
  subscriptionStatus: 'active' | 'expired' | 'suspended';
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  isActive: boolean;
  createdAt: string;
  plan?: { name: string; price: number } | null;
  _count?: { users: number; media: number };
}

export interface BusinessDetail extends Omit<Business, '_count'> {
  plan: SubscriptionPlan | null;
  users: Array<{
    id: string;
    name: string;
    mobileNo: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }>;
  _count: { media: number; mediaEvents: number; users: number };
}

export interface AdminUserRow {
  id: string;
  name: string;
  mobileNo: string;
  role: string;
  city: string | null;
  isActive: boolean;
  expiresAt: string | null;
  lastAppOpenedAt: string | null;
  createdAt: string;
  status: 'active' | 'inactive';
  expired: boolean;
  business: {
    id: string;
    name: string;
    subscriptionStatus: string;
    subscriptionEnd: string | null;
    isActive: boolean;
  };
}

export interface OverviewStats {
  stats: {
    totalBusinesses: number;
    activeBusinesses: number;
    totalUsers: number;
    totalMedia: number;
  };
  recentBusinesses: Business[];
}
