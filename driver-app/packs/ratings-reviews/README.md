# Pack: ratings-reviews

Star ratings + written reviews on any entity (product, place, service), with an **average + count**
summary. One review per user per entity (upsert), public read, write/delete your own. Logic-first;
UI is a placeholder. **Key-free.**

## What you get

- `data/reviews-repo.ts` — `listReviews`, `getSummary` (avg + count via RPC), `submitReview` (upsert).
- `useReviews(entityType, entityId)` — summary + list + submit, refreshing the average after a write.
- `ReviewsScreen` — **placeholder** with a 1–5 picker and the list.
- `supabase/0010_reviews.sql` — `reviews` table (unique per user/entity), public-read RLS, self-only
  write, and the `review_summary()` aggregate RPC.

## Install

```
/add-feature ratings-reviews
# apply the migration, then:
supabase db reset && supabase test db
```

Attach to anything:

```tsx
<ReviewsScreen entityType="product" entityId={productId} />
// or headless:
const { summary, submit } = useReviews('place', placeId); // summary.avg_rating, summary.review_count
```

## Notes

The `unique (entity_type, entity_id, user_id)` constraint guarantees **one review per user** — a
second submit updates the first via upsert, so you can't pad a rating. Reviews are public read; RLS
allows write/delete only of your own. To stop review-bombing of things a user never used, gate
`submitReview` behind a server check that the user actually has an order/booking for that entity.
Pairs with `cart-checkout`, `booking-calendar`, and `maps-view`.
