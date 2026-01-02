
export enum UserRole {
  CLIENT = 'CLIENT',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR'
}

export enum RideStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface User {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  isOnline?: boolean;
  isBlocked?: boolean;
  motoPlate?: string;
  pixKey?: string;
  avatar?: string;
  rating?: number;
  ratingCount?: number;
}

export interface ChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface Ride {
  id: string;
  clientId: string;
  clientName: string;
  driverId?: string;
  driverName?: string;
  driverPhoto?: string;
  driverPlate?: string;
  driverPhone?: string;
  origin: string;
  originFull?: string;
  destination: string;
  destinationFull?: string;
  originCoords?: [number, number];
  destCoords?: [number, number];
  driverCurrentCoords?: [number, number];
  distanceKm: number;
  totalPrice: number;
  commissionAmount: number;
  status: RideStatus;
  createdAt: string;
  typing?: Record<string, boolean>;
  rating?: number;
  paymentMethod?: 'MONEY' | 'PIX';
}

export interface CustomFee {
  id: string;
  reason: string;
  value: number;
  type: 'time' | 'date';
  startHour?: number;
  endHour?: number;
  enabled: boolean;
}

export interface AppSettings {
  commissionPercent: number;
  devCommissionPercent: number;
  partnerCommissionPercent: number;
  baseFare: number;
  perKmRate: number;
  customFees: CustomFee[];
}
