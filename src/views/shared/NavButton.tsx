import React from 'react';
import { cn } from '../../components/ui';

interface NavButtonProps {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  badge?: number | null;
}

export function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
  badge
}: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all relative",
        active ? "text-blue-900" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {badge !== undefined && badge !== null && badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
          {badge}
        </span>
      )}
      <Icon className={cn("w-6 h-6", active && "animate-bounce")} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
