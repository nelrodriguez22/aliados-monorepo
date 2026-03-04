import { tw } from '@/shared/styles/design-system';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'error' | 'outline';
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function Button({ 
  variant = 'primary', 
  children, 
  onClick, 
  type = 'button',
  className = '',
  disabled = false,
  fullWidth = false
}: ButtonProps) {
  // Normalizar 'error' a 'danger' para usar el mismo estilo
  const normalizedVariant = variant === 'error' ? 'danger' : variant;
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${tw.btn[normalizedVariant]} ${fullWidth ? 'w-full' : ''} ${className} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      {children}
    </button>
  );
}
