import { tw } from '@/shared/styles/design-system';

interface CardProps {
  children: React.ReactNode;
  hover?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, hover = false, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`${hover ? tw.cardHover : tw.card} ${className}`}
    >
      {children}
    </div>
  );
}
