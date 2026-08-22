/**
 * The FAQ content, in one place.
 *
 * Lifted out of the /faq route so the landing page can show a handful of these
 * without a second copy of the strings going stale against the first. The full
 * list is the page; the `featured` subset is the landing preview.
 *
 * The first four are the legacy questions, kept word for word. The rest answer
 * things the code actually enforces (ticket caps, verification lifetime,
 * single-use QR) so nobody has to discover them at the door.
 *
 * `featured` is a deliberate five, not "the first five". A landing visitor is
 * deciding whether to trust the checkout, so the picks are the doubts that stop
 * a booking - the cap, the door, and what happens to your money if the last seat
 * goes while you are paying - plus one route in for organisers. "Where can I see
 * my bookings?" and "How do I contact support?" answer questions you only have
 * after signing up, and the verification-code entry describes a flow that is
 * being replaced; none of them earn a slot here.
 */
export const FAQS = [
  {
    q: "How do I book an event?",
    a: "Create an account, select an event, choose the number of tickets, and confirm your booking.",
    featured: true,
  },
  {
    q: "Where can I see my bookings?",
    a: 'All your bookings are available in the "My Bookings" section of your profile.',
  },
  {
    q: "Can I create my own event?",
    a: "Users with Organizer privileges can create and manage events through the dashboard.",
    featured: true,
  },
  {
    q: "How do I contact support?",
    a: "Visit the Support page and submit your query through the contact form.",
  },
  {
    q: "How many tickets can I buy at once?",
    a: "Up to ten per order. If you need more than that for a group, book in batches or message the organizer through Support.",
    featured: true,
  },
  {
    q: "My verification code hasn't arrived.",
    a: "Codes are valid for ten minutes and can be resent after a 30-second wait. Check your spam folder first — if it still hasn't arrived, the email domain may not be able to receive mail, and we'll tell you so when you try again.",
  },
  {
    q: "How does check-in work?",
    a: "Every confirmed booking gets a ticket PDF with a QR code. Door staff scan it once. A second scan of the same code is rejected, so a screenshot passed to a friend won't get them in.",
    featured: true,
  },
  {
    q: "An event says sold out but I had it in my basket.",
    a: "Seats are only held once payment clears, and the check is atomic — the last seat goes to whoever completes payment first. Nothing is charged if the seats run out mid-checkout.",
    featured: true,
  },
  {
    q: "Can I sign in with Google?",
    a: "Yes. Google accounts are matched to your email address, so if you already signed up with that address you'll land in the same account.",
  },
];

/** The landing-page preview. Order follows the full list, so nothing reshuffles. */
export const FEATURED_FAQS = FAQS.filter((item) => item.featured);
