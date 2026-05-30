// Wired to live edge functions. Public reads (list-properties / get-property) are
// unauthed; seller writes + visit requests are JWT-authed via apiPost. The shape of
// each query result is unchanged from the mock contract — screens that previously
// consumed mockProperties continue to work without translation.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Property, PropertyType } from '../types';
import { apiPost } from '../../lib/api';

export interface PropertyFilters {
  type?: PropertyType;
  city?: string;
  rooms?: string | null;
  priceMaxGnf?: number;
  distanceToRoadMaxM?: number;
  furnishedOnly?: boolean;
  query?: string;
}

export interface CreatePropertyInput {
  shop_id?: string;
  type: 'location' | 'vente' | 'terrain';
  title: string;
  description?: string;
  price_minor: number;
  bedrooms?: number;
  area_sqm?: number;
  furnished?: boolean;
  amenities: string[];
  city: string;
  district?: string;
  distance_to_road_m: number;
  lat?: number;
  lng?: number;
  photos: { url: string; storage_path: string; position: number }[];
}

export interface UpdatePropertyInput {
  id: string;
  type?: 'location' | 'vente' | 'terrain';
  title?: string;
  description?: string;
  price_minor?: number;
  bedrooms?: number | null;
  area_sqm?: number | null;
  furnished?: boolean | null;
  amenities?: string[];
  city?: string;
  district?: string | null;
  distance_to_road_m?: number;
  lat?: number | null;
  lng?: number | null;
  photos?: { url: string; storage_path: string; position: number }[];
  status?: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
}

export interface RequestVisitInput {
  property_id: string;
  requested_at: string;
  note?: string;
}

export interface VisitRequest {
  id: string;
  propertyId: string;
  buyerId: string;
  requestedAt: string;
  note: string;
  status: string;
  createdAt: string;
}

interface Cursor { created_at: string; id: string }

// Translate the frontend's rooms string into numeric min/max bounds for list-properties.
// 'studio' → max 1; '4+' → min 4; '1'/'2'/'3' → exact via both bounds.
function roomsToBedrooms(rooms: string | null | undefined): { min?: number; max?: number } {
  if (!rooms) return {};
  if (rooms === 'studio') return { max: 1 };
  if (rooms === '4+') return { min: 4 };
  const n = Number(rooms);
  return Number.isInteger(n) && n >= 0 ? { min: n, max: n } : {};
}

export function useProperties(filters: PropertyFilters = {}) {
  return useQuery({
    queryKey: ['properties', filters],
    queryFn: async (): Promise<Property[]> => {
      const { min: bedrooms_min, max: bedrooms_max } = roomsToBedrooms(filters.rooms);
      const { properties } = await apiPost<{ properties: Property[]; next_cursor: Cursor | null }>({
        path: '/list-properties',
        authed: false,
        body: {
          type: filters.type,
          city: filters.city || undefined,
          bedrooms_min,
          bedrooms_max,
          price_max: filters.priceMaxGnf || undefined,
          distance_max: filters.distanceToRoadMaxM || undefined,
          furnished: filters.furnishedOnly === true ? true : undefined,
          query: filters.query || undefined,
        },
      });
      return properties;
    },
  });
}

export function useProperty(id: string | undefined) {
  return useQuery({
    queryKey: ['property', id],
    enabled: !!id,
    queryFn: async (): Promise<Property | undefined> => {
      const { property } = await apiPost<{ property: Property }>({
        path: '/get-property',
        authed: false,
        body: { id },
      });
      return property;
    },
  });
}

export function useNearbyProperties(limit = 4) {
  return useQuery({
    queryKey: ['properties-nearby', limit],
    queryFn: async (): Promise<Property[]> => {
      const { properties } = await apiPost<{ properties: Property[]; next_cursor: Cursor | null }>({
        path: '/list-properties',
        authed: false,
        body: { limit },
      });
      return properties;
    },
  });
}

// Seller writes — all require auth. The first property also auto-creates "Mon agence"
// server-side (unless the user already has a shop from a product publish), so the
// wizard doesn't need a separate shop-setup step.
export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePropertyInput) => {
      const r = await apiPost<{ property: Property }>({ path: '/property-create', body: input });
      return r.property;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['properties-nearby'] });
      qc.invalidateQueries({ queryKey: ['my-shops'] });
    },
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePropertyInput) => {
      const r = await apiPost<{ property: Property }>({ path: '/property-update', body: input });
      return r.property;
    },
    onSuccess: (property) => {
      qc.invalidateQueries({ queryKey: ['property', property.id] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['properties-nearby'] });
    },
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiPost<{ deleted: true }>({ path: '/property-delete', body: { id } });
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['properties-nearby'] });
      qc.invalidateQueries({ queryKey: ['my-shops'] });
    },
  });
}

export function useRequestVisit() {
  return useMutation({
    mutationFn: async (input: RequestVisitInput) => {
      const r = await apiPost<{ visit_request: VisitRequest }>({ path: '/request-visit', body: input });
      return r.visit_request;
    },
  });
}
