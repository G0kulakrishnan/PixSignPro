export type Role = 'business_admin' | 'media_admin' | 'staff';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  businessId: string;
  businessName: string;
}

export interface Profile {
  id: string;
  name: string;
  mobileNo: string;
  role: Role;
  businessId: string;
  profilePicUrl: string | null;
  companyLogoUrl: string | null;
  agencyName: string | null;
  city: string | null;
  youtube: string | null;
  website: string | null;
  instagram: string | null;
  optional1: string | null;
  optional2: string | null;
  lastAppOpenedAt: string | null;
  business: { name: string; website: string | null };
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  title: string;
  mimeType: string;
  fileSize: number;
  scheduledPublishAt: string | null;
  published: boolean;
  createdAt: string;
  uploadedById: string | null;
}

export interface User {
  id: string;
  name: string;
  mobileNo: string;
  role: Role;
  city: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface AnalyticsRow {
  sNo: number;
  username: string;
  mobileNo: string;
  city: string | null;
  mediaName: string;
  uploadedDate: string;
  imageShared: number;
  imageDownloaded: number;
  videoShared: number;
  videoDownloaded: number;
  appOpened?: number;
  appOpenedDate: string | null;
  date: string;
}
