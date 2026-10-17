-- v21 (Oct 17 2026): PayU becomes the live gateway. Razorpay stays supported.
-- purchases.razorpay_order_id / razorpay_payment_id keep their names and now hold the gateway's
-- order id and payment id for either provider (PayU: txnid, and 'payu_' || mihpayid).
-- grant_purchase() is unchanged and shared by both gateways.
alter table public.purchases add column if not exists provider text not null default 'razorpay';
alter table public.purchases drop constraint if exists purchases_provider_check;
alter table public.purchases add constraint purchases_provider_check check (provider in ('razorpay', 'payu'));
create index if not exists purchases_provider_idx on public.purchases (provider, created_at desc);
notify pgrst, 'reload schema';
