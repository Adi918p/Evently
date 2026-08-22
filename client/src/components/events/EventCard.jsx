import { memo } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { CalendarBlank, Clock, MapPin, Users } from "@phosphor-icons/react";
import { format } from "date-fns";
import GlassCard from "../ui/GlassCard";
import Badge, { StatusBadge } from "../ui/Badge";
import {
  categoryIcon,
  categoryLabel,
  eventDate,
  formatNumber,
  formatPrice,
  inferCategory,
  isPastEvent,
  seatsLeft,
} from "../../lib/constants";
import { respectMotion, riseIn } from "../../motion/presets";

/**
 * Event card.
 *
 * The whole card is one link, so there is a single tab stop and the entire
 * surface is tappable rather than just a small "View" button
 * (no-precision-required). The visible price and seat count use tabular figures
 * so a grid of cards does not jitter as numbers differ (number-tabular).
 *
 * The banner has explicit dimensions via aspect-ratio, so the grid reserves its
 * space before images load and nothing shifts (image-dimension).
 */

function EventCardBase({ event, showStatus = false, index = 0 }) {
  const reduced = useReducedMotion();

  const category = inferCategory(event);
  const CategoryIcon = categoryIcon(category);
  const date = eventDate(event);
  const past = isPastEvent(event);
  const left = seatsLeft(event);
  const soldOut = Number(event?.seats) > 0 && left === 0;

  return (
    <motion.div variants={respectMotion(riseIn, reduced)} custom={index}>
      <GlassCard
        elevation={2}
        radius="xl"
        interactive
        className="group h-full overflow-hidden"
      >
        <Link
          to={`/events/${event._id}`}
          className="flex h-full flex-col focus-visible:outline-offset-4"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-[var(--color-muted)]">
            {event.banner ? (
              <motion.img
                src={event.banner}
                alt=""
                loading={index < 3 ? "eager" : "lazy"}
                decoding="async"
                className="size-full object-cover"
                initial={false}
                animate={{ scale: 1 }}
                whileHover={reduced ? undefined : { scale: 1.06 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid size-full place-items-center bg-[image:var(--grad-brand-soft)] text-[var(--color-violet-bright)]"
              >
                <CategoryIcon size={40} />
              </div>
            )}

            {/* Scrim so the badges stay legible over any photo. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[rgba(5,5,16,0.85)] via-transparent to-[rgba(5,5,16,0.35)]"
            />

            <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
              <Badge tone="brand" icon={CategoryIcon}>
                {categoryLabel(category)}
              </Badge>
              {showStatus && event.status ? (
                <StatusBadge status={event.status} />
              ) : null}
              {soldOut ? <Badge tone="danger">Sold out</Badge> : null}
              {past && !soldOut ? <Badge tone="neutral">Finished</Badge> : null}
            </div>

            {date ? (
              <div className="glass glass-3 absolute bottom-3 left-3 flex flex-col items-center rounded-[var(--radius-md)] px-3 py-1.5 leading-none">
                <span className="tnum text-lg font-bold">
                  {format(date, "dd")}
                </span>
                <span className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--color-fg-muted)]">
                  {format(date, "MMM")}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-3 p-5">
            <h3 className="line-clamp-2 text-lg leading-snug transition-colors group-hover:text-[var(--color-violet-bright)]">
              {event.title}
            </h3>

            <ul className="flex flex-col gap-1.5 text-sm text-[var(--color-fg-muted)]">
              <li className="flex items-center gap-2">
                <MapPin size={15} className="shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {event.venue}
                  {event.location ? `, ${event.location}` : ""}
                </span>
              </li>
              {event.time ? (
                <li className="flex items-center gap-2">
                  <Clock size={15} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{event.time}</span>
                </li>
              ) : null}
              {date ? (
                <li className="flex items-center gap-2 sm:hidden">
                  <CalendarBlank size={15} className="shrink-0" aria-hidden="true" />
                  <span>{format(date, "EEE d MMM yyyy")}</span>
                </li>
              ) : null}
            </ul>

            <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--glass-edge)] pt-4">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-[var(--color-fg-subtle)]">
                  From
                </p>
                <p className="tnum text-lg font-bold text-[var(--color-fg)]">
                  {formatPrice(event.price)}
                </p>
              </div>

              {Number(event?.seats) > 0 ? (
                <p
                  className={`flex items-center gap-1.5 text-xs ${
                    left <= 10 && left > 0
                      ? "text-[var(--color-warning)]"
                      : "text-[var(--color-fg-subtle)]"
                  }`}
                >
                  <Users size={14} aria-hidden="true" />
                  <span className="tnum">{formatNumber(left)}</span> left
                </p>
              ) : null}
            </div>
          </div>
        </Link>
      </GlassCard>
    </motion.div>
  );
}

const EventCard = memo(EventCardBase);
export default EventCard;
