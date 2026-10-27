import { Input, Select, Textarea } from '../ui/Field';
import Button from '../ui/Button';

export default function RegistrationEditor({ value = [], onChange }) {
  const update = (index, patch) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div className="space-y-5">
    {value.map((row, index) => <fieldset key={row.key} className="space-y-3 rounded-xl border border-[var(--glass-edge)] p-4">
      <legend className="px-2 text-sm">Question {index + 1}</legend>
      <Input label="Question" value={row.label} maxLength={40} required onChange={e => update(index, { label: e.target.value })} />
      <Select label="Answer type" value={row.type} options={[{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'select', label: 'Choose one' }, { value: 'multiselect', label: 'Choose several' }, { value: 'checkbox', label: 'Confirmation checkbox' }]} onChange={e => update(index, { type: e.target.value })} />
      {['select', 'multiselect'].includes(row.type) && <Textarea label="Options, one per line" rows={4} value={(row.options || []).join('\n')} onChange={e => update(index, { options: e.target.value.split('\n').slice(0, 20) })} helper="Up to 20 options, 40 characters each." />}
      <Input label="Help text" value={row.helper || ''} maxLength={120} onChange={e => update(index, { helper: e.target.value })} />
      <div className="flex flex-wrap gap-4 text-sm">
        {[['required', 'Required'], ['showOnTicket', 'Show on ticket'], ['showOnScan', 'Show at check-in']].map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={row[key] === true} onChange={e => update(index, { [key]: e.target.checked })} />{label}</label>)}
      </div>
      <Button variant="ghost" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove question</Button>
    </fieldset>)}
    <Button variant="secondary" disabled={value.length >= 8} onClick={() => onChange([...value, { key: `q-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`, label: '', type: 'text', options: [], required: false, showOnTicket: true, showOnScan: true }])}>Add question</Button>
    <p className="text-xs text-[var(--color-fg-muted)]">Up to 8 questions. Answers are saved with the purchase.</p>
  </div>;
}
