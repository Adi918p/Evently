import {
  Children,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "motion/react";
import { CaretLeft, CaretRight, Pause, Play } from "@phosphor-icons/react";

/**
 * Scroll-snap carousel with auto-advance.
 *
 * Built on a real overflow-x scroller rather than a transformed track, which is
 * what buys the behaviour you would otherwise have to reimplement badly: native
 * touch swipe with momentum, trackpad gestures, scroll-snap alignment at any
 * card width, and a scroll position the browser restores for free. The buttons
 * drive it with scrollTo, so the pointer and the controls are never fighting two
 * different sources of truth.
 *
 * Auto-advance follows the WAI `auto-rotation-controls` contract in full. It
 * stops on the pause button, on pointer over the track, on focus inside it, when
 * the carousel scrolls off screen, when the tab is hidden, and under
 * prefers-reduced-motion - where it never starts and the first slide is simply
 * the resting state.
 *
 * Two details that are easy to get wrong:
 *
 *   - The countdown restarts whenever the active slide changes, including when
 *     the change came from a swipe. So a manual interaction resets the timer
 *     instead of being interrupted a moment later by the timer firing.
 *   - The live region is `off` while rotating and only `polite` once stopped.
 *     A carousel that announces itself every five seconds makes a screen reader
 *     unusable, which is why APG scopes the announcement to the stopped state.
 */

export default function Carousel({
  /** Accessible name, e.g. "Trending events". */
  label,
  /** Milliseconds each slide rests before advancing. */
  intervalMs = 5200,
  /** Tailwind widths per slide. Percentages so 3-up leaves a peek of the 4th. */
  slideClassName = "w-[84%] sm:w-[47%] lg:w-[31.4%]",
  className = "",
  children,
}) {
  const reduced = useReducedMotion();
  const slides = Children.toArray(children);
  const count = slides.length;
  const statusId = useId();

  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const activeRef = useRef(0);
  activeRef.current = active;

  const hovering = useRef(false);
  const focused = useRef(false);
  const onscreen = useRef(true);
  const [blocked, setBlocked] = useState(false);

  /* ---- movement --------------------------------------------------------- */

  const scrollToIndex = useCallback(
    (index) => {
      const track = trackRef.current;
      const slide = track?.children?.[index];
      if (!track || !slide) return;

      // Measured as a delta from the current position rather than read off
      // offsetLeft: offsetLeft is relative to the nearest positioned ancestor,
      // which is not necessarily this scroller, and gets it wrong the moment
      // someone wraps the carousel in a relative container.
      const delta =
        slide.getBoundingClientRect().left - track.getBoundingClientRect().left;

      track.scrollTo({
        left: track.scrollLeft + delta,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [reduced]
  );

  const goNext = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // With three cards visible the last card can never reach the left edge, so
    // `active` saturates a few slides early. Without this the auto-advance
    // would silently stall at the end instead of looping.
    const atEnd =
      track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    scrollToIndex(atEnd ? 0 : Math.min(activeRef.current + 1, count - 1));
  }, [count, scrollToIndex]);

  const goPrev = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const atStart = track.scrollLeft <= 4;
    scrollToIndex(atStart ? count - 1 : Math.max(activeRef.current - 1, 0));
  }, [count, scrollToIndex]);

  /* ---- active slide ------------------------------------------------------ */

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const trackLeft = track.getBoundingClientRect().left;
      let best = 0;
      let bestDistance = Infinity;

      for (let i = 0; i < track.children.length; i += 1) {
        const distance = Math.abs(
          track.children[i].getBoundingClientRect().left - trackLeft
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }

      setActive(best);
    };

    // Coalesced into one rAF per frame, and it only ever reads layout - there
    // are no interleaved writes, so this cannot thrash (reduce-reflows).
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  /* ---- auto-advance ----------------------------------------------------- */

  useEffect(() => {
    if (reduced) return undefined;

    const track = trackRef.current;
    const observer = track
      ? new IntersectionObserver(
          ([entry]) => {
            onscreen.current = entry.isIntersecting;
            setBlocked(!entry.isIntersecting || document.hidden);
          },
          { threshold: 0.2 }
        )
      : null;
    observer?.observe(track);

    const onVisibility = () =>
      setBlocked(document.hidden || !onscreen.current);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  const running = !reduced && !paused && !blocked && count > 1;

  useEffect(() => {
    if (!running) return undefined;

    const timer = window.setInterval(() => {
      // Hover and focus are read at fire time rather than gating the interval,
      // so moving the pointer away resumes on the next beat without tearing
      // down and rebuilding the timer on every pointer event.
      if (hovering.current || focused.current) return;
      goNext();
    }, intervalMs);

    return () => window.clearInterval(timer);
    // `active` is a dependency on purpose: any change - swipe, button, dot -
    // restarts the countdown so the timer never fires straight after a manual
    // move.
  }, [running, intervalMs, goNext, active]);

  /* ---- keyboard --------------------------------------------------------- */

  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
    }
  };

  if (!count) return null;

  return (
    <div className={className}>
      <div
        ref={trackRef}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        aria-describedby={statusId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
        }}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
        }}
        className={[
          "flex snap-x snap-mandatory gap-6 overflow-x-auto pb-3",
          // Keeps a horizontal swipe inside the carousel instead of triggering
          // the browser's back gesture (gesture-conflicts).
          "overscroll-x-contain",
          // The bar is redundant next to the arrows and dots, and a visible one
          // inside a glass card looks like a rendering fault.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "focus-visible:outline-offset-4",
        ].join(" ")}
      >
        {slides.map((slide, index) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
            // The track stretches every slide to the tallest one; `[&>*]:h-full`
            // passes that height through to the card inside, so a row of cards
            // with different amounts of text still lines up top and bottom.
            className={`shrink-0 snap-start [&>*]:h-full ${slideClassName}`}
          >
            {slide}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        {/* Dots double as the position readout, so there is a visible indicator
            of where you are and not just a way to move. */}
        <div className="flex items-center gap-2">
          {slides.map((_, index) => {
            const current = index === active;
            return (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                type="button"
                onClick={() => scrollToIndex(index)}
                aria-current={current ? "true" : undefined}
                // 44px of touch height with an 8px visual dot, so the target
                // clears the minimum without a row of fat circles
                // (touch-target-size, no-precision-required).
                className="grid h-11 w-5 place-items-center"
              >
                <span
                  aria-hidden="true"
                  className={[
                    "block h-2 rounded-[var(--radius-pill)] transition-all duration-[var(--dur-base)]",
                    current
                      ? "w-5 bg-[image:var(--grad-brand)]"
                      : "w-2 bg-white/25 hover:bg-white/45",
                  ].join(" ")}
                />
                <span className="sr-only">{`Go to slide ${index + 1}`}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {reduced ? null : (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              className="glass glass-2 glass-specular grid size-11 place-items-center rounded-[var(--radius-pill)] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
            >
              {paused ? (
                <Play size={15} weight="fill" aria-hidden="true" />
              ) : (
                <Pause size={15} weight="fill" aria-hidden="true" />
              )}
              <span className="sr-only">
                {paused ? "Resume auto-advance" : "Pause auto-advance"}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={goPrev}
            className="glass glass-2 glass-specular grid size-11 place-items-center rounded-[var(--radius-pill)] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            <CaretLeft size={16} weight="bold" aria-hidden="true" />
            <span className="sr-only">Previous</span>
          </button>

          <button
            type="button"
            onClick={goNext}
            className="glass glass-2 glass-specular grid size-11 place-items-center rounded-[var(--radius-pill)] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            <CaretRight size={16} weight="bold" aria-hidden="true" />
            <span className="sr-only">Next</span>
          </button>
        </div>
      </div>

      {/* Silent while rotating, announced once stopped - see the header note. */}
      <p
        id={statusId}
        aria-live={running ? "off" : "polite"}
        className="sr-only"
      >
        {`Slide ${active + 1} of ${count}`}
      </p>
    </div>
  );
}
