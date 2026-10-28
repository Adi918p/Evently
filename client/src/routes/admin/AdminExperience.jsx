import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Images, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import { Input, Textarea } from "../../components/ui/Field";
import { ConfirmDialog } from "../../components/ui/Modal";
import { EmptyState, ErrorState, SkeletonRows } from "../../components/ui/Feedback";
import Seo from "../../components/seo/Seo";
import AdminNav from "./AdminNav";
import { useApi } from "../../lib/useApi";
import { experience as experienceApi } from "../../lib/api";
import { ACCEPT_ATTR, uploadImages } from "../../lib/images";
import { useToast } from "../../lib/toast";

const MAX_IMAGES = 12;
const blankSection = () => ({ title: "", description: "", images: [], published: false, order: 0 });

export default function AdminExperience() {
  const { data, error, loading, reload } = useApi((signal) => experienceApi.all(signal), []);
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const [formError, setFormError] = useState("");
  const [progress, setProgress] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const busyRef = useRef(false);
  const titleRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (draft) titleRef.current?.focus();
  }, [draft?._id, Boolean(draft)]);

  function edit(section) {
    if (busyRef.current) return;
    setFormError("");
    setProgress("");
    setDraft(section ? { ...section, images: section.images.map((photo) => ({ ...photo })) } : blankSection());
  }

  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function addImages(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || busyRef.current) return;
    setFormError("");
    if (draft.images.length + files.length > MAX_IMAGES) {
      setFormError(`Each section can have up to ${MAX_IMAGES} images. Choose fewer files.`);
      return;
    }
    busyRef.current = true;
    setBusy("upload");
    try {
      const urls = await uploadImages(files, { onProgress: ({ phase, done, total }) =>
        setProgress(`${phase === "processing" ? "Preparing" : "Uploading"} images: ${done} of ${total}`) });
      setDraft((current) => ({ ...current, images: [...current.images, ...urls.map((url) => ({ url, alt: "" }))] }));
      setProgress(`${urls.length} image${urls.length === 1 ? "" : "s"} added. Save the section to keep your changes.`);
    } catch (err) {
      setFormError(err.message);
      setProgress("");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  function moveImage(index, direction) {
    const images = [...draft.images];
    [images[index], images[index + direction]] = [images[index + direction], images[index]];
    change("images", images);
  }

  async function save(event) {
    event.preventDefault();
    if (busyRef.current) return;
    setFormError("");
    if (!draft.title.trim()) return setFormError("Enter a section title.");
    if (draft.order === "" || !Number.isInteger(Number(draft.order)) || Number(draft.order) < 0 || Number(draft.order) > 9999) {
      return setFormError("Display order must be a whole number between 0 and 9999.");
    }
    if (draft.published && !draft.images.length) return setFormError("Add at least one image before publishing this section.");
    busyRef.current = true;
    setBusy("save");
    const payload = { title: draft.title.trim(), description: draft.description.trim(),
      images: draft.images.map(({ url, alt }) => ({ url, alt: alt.trim() })), published: draft.published, order: Number(draft.order) };
    try {
      if (draft._id) await experienceApi.update(draft._id, payload);
      else await experienceApi.create(payload);
      toast.success(payload.published ? "Experience section published." : "Experience draft saved.");
      setDraft(null);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  async function remove() {
    if (!pendingDelete || busyRef.current) return;
    busyRef.current = true;
    setBusy("delete");
    setDeleteError("");
    try {
      await experienceApi.remove(pendingDelete._id);
      if (draft?._id === pendingDelete._id) setDraft(null);
      setPendingDelete(null);
      toast.success("Experience section deleted.");
      reload();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }

  return (
    <div className="shell section">
      <Seo title="Experience · Admin" noindex />
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl space-y-3">
          <p className="kicker">Admin</p>
          <h1 className="text-4xl">Experience</h1>
          <p className="text-[var(--color-fg-muted)]">Create sections and photo galleries for the Experience page. Save a draft, then publish when it is ready.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button to="/experience" variant="ghost">View Experience page</Button>
          <Button variant="primary" onClick={() => edit(null)} disabled={Boolean(draft) || Boolean(busy)}><Plus size={18} aria-hidden="true" /> Add section</Button>
        </div>
      </header>
      <AdminNav />

      {draft ? (
        <GlassCard elevation={2} radius="xl" className="mt-8 p-5 sm:p-8">
          <h2 className="text-2xl">{draft._id ? "Edit section" : "New section"}</h2>
          <form onSubmit={save} className="mt-6 space-y-6" aria-label="Experience section">
            <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-6">
              <Input ref={titleRef} label="Section title" required maxLength={120} value={draft.title} onChange={(event) => change("title", event.target.value)} />
              <Textarea label="Description" optional maxLength={2000} value={draft.description} onChange={(event) => change("description", event.target.value)} />
              <Input label="Display order" type="number" min={0} max={9999} step={1} required helper="Lower numbers appear first. Sections with the same number appear in creation order."
                value={draft.order} onChange={(event) => change("order", event.target.value)} />

              <section aria-labelledby="experience-images-title">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                  <h3 id="experience-images-title" className="text-lg">Images</h3>
                  <span className="text-sm text-[var(--color-fg-subtle)]">{draft.images.length} / {MAX_IMAGES}</span>
                </div>
                <Input label="Add images" type="file" accept={ACCEPT_ATTR} multiple onChange={addImages} disabled={draft.images.length >= MAX_IMAGES}
                  helper="JPG, PNG, WebP or GIF. Choose up to 12 photos per section. Add a description to make each photo accessible." className="py-3 text-sm" />
                <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {draft.images.map((photo, index) => (
                    <li key={photo.url} className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--glass-edge)] p-3">
                      <img src={photo.url} alt={photo.alt || `Photo ${index + 1} preview`} width="480" height="360" className="aspect-[4/3] w-full rounded-[var(--radius-md)] object-cover" />
                      <Input label={`Photo ${index + 1} description`} maxLength={160} value={photo.alt} fieldClassName="mt-3"
                        onChange={(event) => change("images", draft.images.map((item, itemIndex) => itemIndex === index ? { ...item, alt: event.target.value } : item))} />
                      <div className="mt-3 flex flex-wrap gap-1">
                        <Button size="sm" iconOnly aria-label={`Move photo ${index + 1} earlier`} disabled={index === 0} onClick={() => moveImage(index, -1)}><ArrowUp size={18} aria-hidden="true" /></Button>
                        <Button size="sm" iconOnly aria-label={`Move photo ${index + 1} later`} disabled={index === draft.images.length - 1} onClick={() => moveImage(index, 1)}><ArrowDown size={18} aria-hidden="true" /></Button>
                        <Button size="sm" variant="danger" aria-label={`Remove photo ${index + 1}`} onClick={() => change("images", draft.images.filter((_, itemIndex) => itemIndex !== index))}><Trash size={16} aria-hidden="true" /> Remove</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--glass-edge)] p-4">
                <input type="checkbox" checked={draft.published} onChange={(event) => change("published", event.target.checked)} className="size-5 accent-[var(--color-violet)]" />
                <span><span className="block font-medium">Published on Experience</span><span className="block text-sm text-[var(--color-fg-subtle)]">Unchecked sections are drafts visible only to admins.</span></span>
              </label>
              <details className="rounded-[var(--radius-md)] border border-[var(--glass-edge)] p-4">
                <summary className="min-h-8 cursor-pointer font-medium">Preview section</summary>
                <h3 className="mt-4 wrap-anywhere text-2xl">{draft.title || "Untitled section"}</h3>
                <p className="mt-3 whitespace-pre-line wrap-anywhere text-[var(--color-fg-muted)]">{draft.description}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{draft.images.map((photo, index) => <img key={photo.url} src={photo.url} alt={photo.alt || `Photo ${index + 1}`} width="480" height="360" className="aspect-[4/3] w-full rounded-[var(--radius-md)] object-cover" />)}</div>
              </details>
            </fieldset>
            {progress ? <p role="status" className="text-sm text-[var(--color-fg-muted)]">{progress}</p> : null}
            {formError ? <p role="alert" className="text-sm text-[#fca5a5]">{formError}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" loading={busy === "save"} disabled={Boolean(busy)}>{draft.published ? "Save and publish" : "Save draft"}</Button>
              <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        </GlassCard>
      ) : null}

      <div className="mt-8">
        {loading ? <SkeletonRows count={3} /> : error ? <ErrorState title="Couldn't load sections" message={error.message} onRetry={reload} /> : sections.length === 0 ? (
          <EmptyState icon={Images} title="No Experience sections yet" description="Add a section with your event photos, then publish it for everyone to see." />
        ) : (
          <ul className="space-y-4">{sections.map((section) => (
            <li key={section._id}>
              <GlassCard elevation={1} radius="xl" className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
                {section.images[0] ? <img src={section.images[0].url} alt="" width="112" height="84" loading="lazy" className="aspect-[4/3] w-28 shrink-0 rounded-[var(--radius-md)] object-cover" /> : <Images size={32} className="shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />}
                <div className="min-w-0 flex-1"><h2 className="wrap-anywhere text-lg">{section.title}</h2>
                  <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{section.published ? "Published" : "Draft"} · {section.images.length} photo{section.images.length === 1 ? "" : "s"} · Order {section.order}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={Boolean(busy) || Boolean(draft)} onClick={() => edit(section)} aria-label={`Edit ${section.title}`}><PencilSimple size={16} aria-hidden="true" /> Edit</Button>
                  <Button size="sm" variant="danger" disabled={Boolean(busy) || Boolean(draft)} onClick={() => { setDeleteError(""); setPendingDelete(section); }} aria-label={`Delete ${section.title}`}><Trash size={16} aria-hidden="true" /> Delete</Button>
                </div>
              </GlassCard>
            </li>
          ))}</ul>
        )}
      </div>
      <ConfirmDialog open={Boolean(pendingDelete)} onCancel={() => { if (!busyRef.current) setPendingDelete(null); }} onConfirm={remove}
        loading={busy === "delete"} title="Delete this Experience section?" confirmLabel="Delete section">
        <p className="text-sm text-[var(--color-fg-muted)]">“{pendingDelete?.title}” and its gallery will be removed from Experience. This does not delete events or bookings.</p>
        {deleteError ? <p role="alert" className="mt-3 text-sm text-[#fca5a5]">{deleteError}</p> : null}
      </ConfirmDialog>
    </div>
  );
}
