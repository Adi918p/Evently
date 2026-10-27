import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import GlassCard from '../components/ui/GlassCard';
import Button from '../components/ui/Button';
import { ErrorState, Loader } from '../components/ui/Feedback';
import { QrPanel } from '../components/bookings/BookingTicket';
import Seo from '../components/seo/Seo';
import { useApi } from '../lib/useApi';
import { payments } from '../lib/api';

export default function BookingSuccess() {
  const [params] = useSearchParams();
  const purchaseId = params.get('purchase');
  const { data, error, loading, reload } = useApi(signal => payments.status(purchaseId, signal), [purchaseId], { enabled: Boolean(purchaseId) });
  const processing = ['creating', 'pending', 'refund_pending'].includes(data?.state);
  useEffect(() => {
    if (!processing) return;
    let attempts = 0;
    const timer = setInterval(() => { if (++attempts >= 24) clearInterval(timer); reload(); }, 5000);
    return () => clearInterval(timer);
  }, [processing, reload]);
  const booking = data?.booking;
  const event = booking?.eventSnapshot || (typeof booking?.event === 'object' ? booking.event : null);
  if (!purchaseId) return <div className="shell section"><Seo title="Booking status" noindex /><ErrorState title="Choose a booking" message="Open a specific purchase from My bookings to check its status." /><Button to="/my-bookings">My bookings</Button></div>;
  if (loading && !data) return <div className="grid min-h-[60dvh] place-items-center"><Loader label="Checking your booking" /></div>;
  if (error) return <div className="shell section"><ErrorState title="Could not check this purchase" message={error.message} onRetry={reload} /><Button to="/my-bookings">My bookings</Button></div>;
  if (data?.state !== 'fulfilled' || booking?.status !== 'confirmed') {
    const title = data?.state === 'refunded' ? 'Payment refunded' : data?.state === 'refund_pending' ? 'Refund in progress' : data?.state === 'failed' ? 'Booking not completed' : booking?.status === 'cancelled' ? 'Booking cancelled' : 'Payment confirmation pending';
    return <div className="shell section mx-auto max-w-2xl"><Seo title={title} noindex /><GlassCard className="space-y-5 p-8"><h1 className="font-display text-3xl font-bold">{title}</h1><p role="status">{data?.message || 'We are checking this purchase. If you submitted payment, please avoid paying again while confirmation is pending.'}</p><Button onClick={reload}>Check again</Button><Button variant="secondary" to="/my-bookings">My bookings</Button><Button variant="ghost" to="/support">Contact support</Button></GlassCard></div>;
  }
  return <div className="shell section mx-auto max-w-3xl"><Seo title="Booking confirmed" noindex /><div className="mb-8 text-center"><h1 className="font-display text-4xl font-bold">Your booking is confirmed.</h1><p className="mt-3 text-[var(--color-fg-muted)]">{event?.title}</p></div><GlassCard elevation={3} className="space-y-6 p-6 sm:p-10"><QrPanel booking={booking} event={event} /><p role="status" className="text-sm text-[var(--color-fg-muted)]">{booking.deliveryStatus === 'sent' ? 'Your ticket email was sent.' : booking.deliveryStatus === 'failed' ? 'Email delivery has not succeeded yet. Your booking is confirmed; download the PDF here.' : 'Your ticket email is queued. You can use or download your pass now.'}</p><Button variant="secondary" to="/my-bookings">View my bookings</Button></GlassCard></div>;
}
