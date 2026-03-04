import { tw } from '@/shared/styles/design-system';

interface InputProps {
  label?: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  className?: string;
}

export function Input({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  className = ''
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className={`mb-2 ${tw.label}`}>
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={`${tw.input} ${className}`}
      />
    </div>
  );
}
