import { Input, Textarea } from '../ui/Field';
import catalogue from '../../data/ticket-fields.json';

export default function TicketSettings({ value = {}, onChange }) {
  const update = patch => onChange({ ...value, ...patch });
  return <div className="space-y-5">
    <Input type="color" label="Ticket accent" value={value.accent || '#7c3aed'} onChange={e => update({ accent: e.target.value })} />
    <Textarea label="Ticket notes" maxLength={400} rows={3} value={value.notes || ''} onChange={e => update({ notes: e.target.value })} />
    {[['showOnTicket', 'On the PDF pass', catalogue.ticket, catalogue.ticketDefaults], ['showOnScan', 'At check-in', catalogue.scan, catalogue.scanDefaults]].map(([key, label, fields, defaults]) => <fieldset key={key} className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-x-6 sm:grid-cols-2">{fields.map(field => <label key={field.key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={(value[key]?.length ? value[key] : defaults).includes(field.key)} onChange={e => { const selected = value[key]?.length ? value[key] : defaults; update({ [key]: e.target.checked ? [...selected, field.key] : selected.filter(item => item !== field.key) }); }} />{field.label}</label>)}</div>
      <p className="text-xs text-[var(--color-fg-muted)]">An empty selection uses the standard fields.</p>
    </fieldset>)}
  </div>;
}
