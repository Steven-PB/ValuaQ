import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
}

export interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  maxHeight?: string; // Tailwind max height class, e.g. 'max-h-60'
  enableSearch?: boolean;
  align?: 'left' | 'right';
  icon?: React.ReactNode;
  id?: string;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  className = '',
  menuClassName = '',
  maxHeight = 'max-h-60',
  enableSearch,
  align = 'left',
  icon,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Selected Option
  const selectedOption = useMemo(() => {
    return options.find((o) => o.value === value);
  }, [options, value]);

  // Determine if search should be enabled (auto-enabled if >= 8 items unless explicitly set)
  const shouldShowSearch = enableSearch !== undefined ? enableSearch : options.length >= 8;

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!shouldShowSearch || !searchTerm.trim()) return options;
    const q = searchTerm.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q)) ||
        (o.badge && o.badge.toLowerCase().includes(q))
    );
  }, [options, searchTerm, shouldShowSearch]);

  const handleSelect = (optValue: string, disabled?: boolean) => {
    if (disabled) return;
    onChange(optValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-xs ${className}`} id={id}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#080C14] hover:bg-slate-900 text-slate-200 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer focus:outline-none focus:border-emerald-500/60 ${
          isOpen ? 'border-emerald-500/70 ring-1 ring-emerald-500/25' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
          {selectedOption?.color && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: selectedOption.color }}
            />
          )}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : <span className="text-slate-500">{placeholder}</span>}
          </span>
          {selectedOption?.badge && (
            <span className="text-[10px] text-slate-400 font-mono tabular-nums shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-emerald-400' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu Popover with max height & scroll */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-1.5 min-w-[170px] w-max max-w-xs sm:max-w-sm bg-[#0D131F] border border-slate-700/90 rounded-xl shadow-2xl z-50 py-1 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 ${menuClassName}`}
          style={{ width: 'max(100%, 170px)' }}
        >
          {/* Search bar inside dropdown if list is long */}
          {shouldShowSearch && (
            <div className="p-1.5 border-b border-slate-800/80 bg-[#080C14]/90 sticky top-0 z-10">
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Filter..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#0D131F] border border-slate-800 rounded-lg pl-7 pr-2 py-1 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>
          )}

          {/* Options Container with Max Height and Scroll Feature */}
          <div className={`${maxHeight} overflow-y-auto divide-y divide-slate-800/40 pr-0.5`}>
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-500 text-[11px] italic">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value, opt.disabled)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed text-slate-500'
                        : isSelected
                        ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color }}
                        />
                      )}
                      <div className="truncate">
                        <span className="truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="block text-[10px] text-slate-500 font-normal truncate font-mono tabular-nums">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                      {opt.badge && (
                        <span className="text-[10px] text-slate-400 font-mono tabular-nums shrink-0">
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
