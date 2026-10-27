import { Input, Select, Field } from '../ui/Field';

export default function RegistrationFields({ fields = [], answers, onChange, disabled = false }) {
  const set = (key, value) => onChange({ ...answers, [key]: value });
  return <div className="mt-5 space-y-4">
    {fields.map(field => {
      const id = `registration-${field.key}`;
      if (field.type === 'checkbox') return <Field key={field.key} htmlFor={id} label={field.label} required={field.required} helper={field.helper}>
        <input id={id} type="checkbox" className="size-5" disabled={disabled} checked={answers[field.key] === true} onChange={e => set(field.key, e.target.checked)} aria-describedby={field.helper ? `${id}-helper` : undefined} />
      </Field>;
      if (field.type === 'multiselect') return <fieldset key={field.key} className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{field.label}{field.required ? ' (required)' : ''}</legend>
        {field.helper && <p className="text-xs text-[var(--color-fg-muted)]">{field.helper}</p>}
        {field.options.map(option => <label key={option} className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={(answers[field.key] || []).includes(option)} onChange={e => set(field.key, e.target.checked ? [...(answers[field.key] || []), option] : (answers[field.key] || []).filter(value => value !== option))} />{option}
        </label>)}
      </fieldset>;
      const props = { id, label: field.label, required: field.required, helper: field.helper, disabled, value: answers[field.key] ?? '', onChange: e => set(field.key, e.target.value) };
      return field.type === 'select' ? <Select key={field.key} {...props} placeholder="Choose an option" options={field.options} /> : <Input key={field.key} {...props} type={field.type === 'number' ? 'number' : 'text'} step="any" maxLength={160} />;
    })}
  </div>;
}
