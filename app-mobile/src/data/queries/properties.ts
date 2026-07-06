// Wired to live edge functions. Public reads (list-properties / get-property) are
// unauthed; seller writes + visit requests are JWT-authed via apiPost. The shape of
// each query result is unchanged from the mock contract — screens that previously
// consumed mockProperties continue to work without translation.
import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Property, PropertyType } from '../types';
import { apiPost } from '../../lib/api';
import { useAuth } from '../../stores/auth';

// Hide-own-listings: returns the caller's user id when authed, undefined when
// visitor. Consumers filter `p.ownerId !== meId` ONLY when meId is defined —
// visitors see everything (their own would-be-listings don't exist anyway).
function useMeId(): string | undefined {
  return useAuth((s) => s.user?.id ?? s.authUserId ?? undefined);
}

type ListingStatus = 'active' | 'reserved' | 'sold' | 'paused' | 'pending';

export interface PropertyFilters {
  type?: PropertyType;
  city?: string;
  rooms?: string | null;
  priceMaxGnf?: number;
  distanceToRoadMaxM?: number;
  furnishedOnly?: boolean;
  // Rental billing period ('month' ⇒ per_month=true, 'day' ⇒ false, 'all'/undefined ⇒ both).
  rentalPeriod?: 'all' | 'month' | 'day';
  query?: string;
}

// 'all'/undefined sends nothing; 'month'/'day' map to the per_month boolean.
function periodToPerMonth(p: PropertyFilters['rentalPeriod']): boolean | undefined {
  if (p === 'month') return true;
  if (p === 'day') return false;
  return undefined;
}

export interface CreatePropertyInput {
  shop_id?: string;
  type: 'location' | 'vente' | 'terrain';
  title: string;
  description?: string;
  // Rental billing period. Only sent for locations: true ⇒ /mois, false ⇒ /jour.
  // Omitted for vente/terrain (backend forces false there).
  per_month?: boolean;
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
  per_month?: boolean;
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

export type VisitStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';

export interface VisitRequest {
  id: string;
  propertyId: string;
  buyerId: string;
  requestedAt: string;
  note: string;
  status: VisitStatus | string;
  createdAt: string;
  decidedAt?: string;
  decidedById?: string;
  // Optional joined snapshots — populated by list-agent-visits, absent from
  // request-visit / visit-respond responses (those return the base row only).
  property?: { id: string; title: string; district: string | null; city: string };
  buyer?: { id: string; displayName?: string; avatarUrl?: string };
}

export interface RespondVisitInput {
  visit_request_id: string;
  decision: 'accept' | 'reject';
  note?: string;
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
  const meId = useMeId();
  const query = useQuery({
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
          per_month: periodToPerMonth(filters.rentalPeriod),
          query: filters.query || undefined,
        },
      });
      return properties;
    },
  });
  const data = useMemo(
    () => (meId ? query.data?.filter((p) => p.ownerId !== meId) : query.data),
    [query.data, meId],
  );
  return { ...query, data };
}

// Atomic toggle: the server returns the new state + count, so we update without
// refetch. Mirrors useToggleFavorite for products (see queries/products.ts).
// Requires auth (the user is the favoriter) ; apiPost refreshes the token on
// 401 once.
export function useTogglePropertyFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (propertyId: string) => {
      const r = await apiPost<{ favorited: boolean; fav_count: number }>({
        path: '/property-favorite-toggle',
        body: { property_id: propertyId },
      });
      return { propertyId, ...r };
    },
    onSuccess: ({ propertyId }) => {
      qc.invalidateQueries({ queryKey: ['property', propertyId] });
      qc.invalidateQueries({ queryKey: ['properties'] });
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

// Caller's own properties — surfaces every status (not just active) so sellers can
// manage paused/reserved/sold rows. Powered by list-properties' owner_id filter.
// Guards on UUID shape: pre-real-auth installs (or stale MMKV state from old
// completeOnboarding) can leak a mock 'u_mariama' string into authUserId, which the
// backend validator would reject as INVALID_BODY. Skip silently in that case.
const UUID_RE = /^[0-9a-f-]{36}$/i;
export function useMyProperties() {
  const userId = useAuth((s) => s.authUserId);
  const isUuid = !!userId && UUID_RE.test(userId);
  return useQuery({
    queryKey: ['my-properties', userId],
    enabled: isUuid,
    queryFn: async (): Promise<Property[]> => {
      const { properties } = await apiPost<{ properties: Property[]; next_cursor: Cursor | null }>({
        path: '/list-properties',
        authed: false,
        body: { owner_id: userId },
      });
      return properties;
    },
  });
}

// Infinite-scroll variant of useProperties. Same translation as the non-infinite
// hook: rooms-string → bedrooms_min/bedrooms_max, prices/distances stripped to
// undefined when 0. Returns flat `properties` across all pages.
export function useInfiniteProperties(filters: PropertyFilters = {}) {
  const meId = useMeId();
  const { min: bedrooms_min, max: bedrooms_max } = roomsToBedrooms(filters.rooms);
  const query = useInfiniteQuery({
    queryKey: ['properties-infinite', filters],
    initialPageParam: undefined as Cursor | undefined,
    queryFn: async ({ pageParam }: { pageParam: Cursor | undefined }) => {
      return apiPost<{ properties: Property[]; next_cursor: Cursor | null }>({
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
          per_month: periodToPerMonth(filters.rentalPeriod),
          query: filters.query || undefined,
          cursor: pageParam,
        },
      });
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  // Filter the AGGREGATE so own-listings never appear even if they were in
  // an earlier page. V1.1: push the filter server-side into list-properties.
  const properties = useMemo(() => {
    const all = query.data?.pages.flatMap((p) => p.properties) ?? [];
    return meId ? all.filter((p) => p.ownerId !== meId) : all;
  }, [query.data, meId]);
  return { ...query, properties };
}

export function useNearbyProperties(limit = 4) {
  const meId = useMeId();
  const query = useQuery({
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
  const data = useMemo(
    () => (meId ? query.data?.filter((p) => p.ownerId !== meId) : query.data),
    [query.data, meId],
  );
  return { ...query, data };
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

// Convenience wrapper: status-only update with a narrower input type than
// useUpdateProperty. Invalidates the same caches.
export function useSetPropertyStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: ListingStatus }) => {
      const r = await apiPost<{ property: Property }>({ path: '/property-update', body: input });
      return r.property;
    },
    onSuccess: (property) => {
      qc.invalidateQueries({ queryKey: ['property', property.id] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['properties-nearby'] });
      qc.invalidateQueries({ queryKey: ['my-properties'] });
    },
  });
}

export function useRequestVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RequestVisitInput) => {
      const r = await apiPost<{ visit_request: VisitRequest }>({ path: '/request-visit', body: input });
      return r.visit_request;
    },
    // Phase X.9 — buyer is replaced onto /buyer/requests right after submit ;
    // without this invalidation the destination list is the previous fetch
    // (no new visit visible), contradicting the success toast. Invalidate also
    // ['property', propertyId] so the property detail's "demande envoyée" badge
    // re-renders without a navigation round-trip.
    onSuccess: (visit) => {
      qc.invalidateQueries({ queryKey: ['my-visit-requests'] });
      qc.invalidateQueries({ queryKey: ['property', visit.propertyId] });
    },
  });
}

export function useAgentVisits(status?: VisitStatus | string) {
  return useQuery({
    queryKey: ['agent-visits', status ?? null],
    queryFn: async (): Promise<VisitRequest[]> => {
      const r = await apiPost<{ visits: VisitRequest[] }>({
        path: '/list-agent-visits',
        body: status ? { status } : {},
      });
      return r.visits;
    },
  });
}

// Phase X.1 — buyer-side visit list. Mirrors useAgentVisits but joins the
// property snapshot (cover photo, title, district, city, price) for the
// list card. Sorted server-side requested_at desc.
export interface BuyerVisitRequest extends VisitRequest {
  property?: {
    id: string;
    title: string;
    district: string | null;
    city: string;
    // GNF is integer-only — minor units = major units. Naming the field
    // priceGnf (instead of priceMinor) matches the project-wide convention
    // used by `Product.priceGnf` and prevents a future /100 division bug if a
    // currency with fractional units ever gets bolted on. Values identical.
    priceGnf: number;
    perMonth: boolean;
    coverUrl?: string;
  };
}
export function useMyVisitRequests(status?: VisitStatus | string) {
  return useQuery({
    queryKey: ['my-visit-requests', status ?? null],
    queryFn: async (): Promise<BuyerVisitRequest[]> => {
      const r = await apiPost<{ visits: BuyerVisitRequest[] }>({
        path: '/list-my-visit-requests',
        body: status ? { status } : {},
      });
      return r.visits;
    },
    // Phase X.9 — guarantee the post-request screen shows the fresh row.
    // refetchOnMount: 'always' is fine here because the list is small (≤ 100
    // server-side limit) and buyer-side traffic to /buyer/requests is low.
    refetchOnMount: 'always',
  });
}

export function useRespondVisitRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RespondVisitInput) => {
      const r = await apiPost<{ visit_request: VisitRequest }>({
        path: '/visit-respond',
        body: input,
      });
      return r.visit_request;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-visits'] });
    },
  });
}
