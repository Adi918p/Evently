import { useState } from "react";
import { Images, Sparkle } from "@phosphor-icons/react";
import GlassCard from "../components/ui/GlassCard";
import Modal from "../components/ui/Modal";
import { EmptyState, ErrorState, SkeletonRows } from "../components/ui/Feedback";
import Seo from "../components/seo/Seo";
import { useApi } from "../lib/useApi";
import { experience as experienceApi } from "../lib/api";

/** The showcase contains only sections deliberately published by an admin. */
export default function Experience() {
  const { data, error, loading, reload } = useApi((signal) => experienceApi.list(signal), []);
  const [selected, setSelected] = useState(null);
  const sections = Array.isArray(data?.sections) ? data.sections : [];

  return (
    <div className="shell section">
      <Seo />
      <header className="max-w-2xl space-y-3">
        <p className="kicker"><Sparkle size={14} aria-hidden="true" /> Experience</p>
        <h1 className="text-4xl">Our event <span className="text-grad-brand">experiences</span></h1>
        <p className="text-md leading-relaxed text-[var(--color-fg-muted)]">Moments, people and memories from Evently events.</p>
      </header>
      <div className="mt-12 space-y-10">
        {loading ? <SkeletonRows count={3} /> : error ? (
          <ErrorState title="Couldn't load experiences" message={error.message} onRetry={reload} />
        ) : sections.length === 0 ? (
          <EmptyState icon={Images} title="New memories are on the way"
            description="Photos from our events will appear here soon. Find your next experience in the meantime."
            action="Explore events" actionTo="/events" />
        ) : sections.map((section) => (
          <GlassCard key={section._id} role="region" aria-labelledby={`experience-${section._id}`} elevation={2} radius="xl" className="overflow-hidden p-5 sm:p-8">
            <h2 id={`experience-${section._id}`} className="wrap-anywhere text-2xl sm:text-3xl">{section.title}</h2>
            {section.description ? <p className="mt-3 max-w-3xl whitespace-pre-line wrap-anywhere leading-relaxed text-[var(--color-fg-muted)]">{section.description}</p> : null}
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.images.map((photo, index) => (
                <li key={photo.url} className="min-w-0">
                  <button type="button" className="block w-full overflow-hidden rounded-[var(--radius-lg)] bg-white/[0.04]"
                    aria-label={`View photo ${index + 1} from ${section.title}`}
                    onClick={() => setSelected({ ...photo, title: section.title, index })}>
                    <img src={photo.url} alt={photo.alt || `${section.title} — photo ${index + 1}`} loading="lazy" decoding="async"
                      width="720" height="540" className="aspect-[4/3] w-full object-cover transition-transform hover:scale-[1.03]" />
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title} size="xl">
        {selected ? <img src={selected.url} alt={selected.alt || `${selected.title} — photo ${selected.index + 1}`}
          className="mx-auto max-h-[65dvh] w-full rounded-[var(--radius-md)] object-contain" /> : null}
        {selected?.alt ? <p className="mt-3 text-sm text-[var(--color-fg-muted)]">{selected.alt}</p> : null}
      </Modal>
    </div>
  );
}
