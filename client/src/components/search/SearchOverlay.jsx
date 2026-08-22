import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlass } from "@phosphor-icons/react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { Input } from "../ui/Field";
import { Chip } from "../ui/Badge";
import { CATEGORIES, CITIES } from "../../lib/constants";

/**
 * Global search. Replaces the legacy #searchover panel.
 *
 * It does not fetch anything itself - it builds a query string and hands off to
 * /events, so a search is a real URL that can be shared, bookmarked and used
 * with the back button (deep-linking).
 */

const EMPTY = { query: "", city: "", category: "", date: "" };

export default function SearchOverlay({ open, onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);

  // Reset each time it opens so a stale search never lingers.
  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (form.query.trim()) params.set("q", form.query.trim());
    if (form.city.trim()) params.set("city", form.city.trim());
    if (form.category) params.set("category", form.category);
    if (form.date) params.set("date", form.date);
    onClose?.();
    navigate(`/events${params.toString() ? `?${params}` : ""}`);
  };

  const activeCount = Object.values(form).filter(Boolean).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Find something to do"
      description="Search by name, narrow by city, category or date."
      size="lg"
    >
      <form onSubmit={submit} className="flex flex-col gap-6">
        <Input
          label="Search"
          placeholder="Event name, venue, or keyword"
          type="search"
          autoComplete="off"
          icon={MagnifyingGlass}
          value={form.query}
          onChange={set("query")}
          data-autofocus
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label="City"
            list="evently-cities"
            placeholder="Any city"
            autoComplete="address-level2"
            value={form.city}
            onChange={set("city")}
            helper="Matches the event's city or venue."
          />
          <datalist id="evently-cities">
            {CITIES.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>

          <Input
            label="On or after"
            type="date"
            value={form.date}
            onChange={set("date")}
            helper="Leave empty to see everything upcoming."
          />
        </div>

        {/* Chips rather than a select: on mobile this is the fastest way to
            filter, and every chip is a 44px target. */}
        <fieldset className="min-w-0">
          <legend className="mb-3 text-sm font-medium text-[var(--color-fg-muted)]">
            Category
          </legend>
          <div className="flex flex-wrap gap-2">
            <Chip
              active={!form.category}
              onClick={() => setForm((c) => ({ ...c, category: "" }))}
            >
              All
            </Chip>
            {CATEGORIES.map(({ value, label, icon: Icon }) => (
              <Chip
                key={value}
                active={form.category === value}
                onClick={() =>
                  setForm((c) => ({
                    ...c,
                    category: c.category === value ? "" : value,
                  }))
                }
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--glass-edge)] pt-5">
          {activeCount ? (
            <Button variant="ghost" onClick={() => setForm(EMPTY)}>
              Clear all
            </Button>
          ) : null}
          <Button variant="primary" type="submit">
            <MagnifyingGlass size={17} aria-hidden="true" />
            Search events
          </Button>
        </div>
      </form>
    </Modal>
  );
}
