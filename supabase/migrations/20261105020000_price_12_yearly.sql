-- Owner decision 2026-11-05: Pilgrim Plus yearly is now $12.00 (was $11.99).
-- Display/reference only; the App Store, Play Store and RevenueCat products are the source of truth.
update public.billing_products
   set price_cents = 1200
 where id = 'plus_yearly';
