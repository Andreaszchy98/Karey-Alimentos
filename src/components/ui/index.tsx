import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'default' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ className, variant = 'primary', size = 'md', ...props }) => {
  const variants: Record<string, string> = {
    primary: 'bg-blue-900 text-white hover:bg-blue-950',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    outline: 'border-2 border-blue-900 text-blue-900 hover:bg-blue-900 hover:text-white',
    ghost: 'text-gray-600 hover:bg-gray-100',
    default: 'bg-gray-900 text-white hover:bg-gray-800',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  };
  const sizes: Record<string, string> = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button 
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap', 
        variants[variant] || variants.primary, 
        sizes[size] || sizes.md, 
        className
      )} 
      {...props} 
    />
  );
};

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input 
      ref={ref}
      className={cn('w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all', className)} 
      {...props} 
    />
  )
);
Input.displayName = 'Input';

export const KLogo = ({ size = 'w-10 h-10', className, logoUrl }: { size?: string, className?: string, logoUrl?: string }) => (
  <div className={cn(size, "relative flex items-center justify-center rounded-xl bg-blue-900 text-white shadow-sm overflow-hidden flex-shrink-0", className)}>
    {logoUrl && logoUrl.trim() ? (
      <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
    ) : (
      <span className="font-black text-xl tracking-tighter text-white">K</span>
    )}
  </div>
);
