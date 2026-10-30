import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
}

export interface CustomDropdownProps {
  value?: string;
  onChange?: (value: string) => void;
  multiple?: boolean;
  selectedValues?: string[];
  onMultiChange?: (values: string[]) => void;
  allOptionValue?: string;
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
  value = '',
  onChange,
  multiple = false,
  selectedValues = [],
  onMultiChange,
  allOptionValue = 'all',
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

  // Single-select Selected Option
  const selectedOption = useMemo(() => {
    return options.find((o) => o.value === value);
  }, [options, value]);

  // Multi-select Selected Options (excluding the 'all' option)
  const activeMultiValues = useMemo(() => {
    return selectedValues.filter((v) => v !== allOptionValue);
  }, [selectedValues, allOptionValue]);

  const isAllMultiSelected = activeMultiValues.length === 0;

  const selectedMultiOptions = useMemo(() => {
    if (!multiple) return [];
    return options.filter((o) => o.value !== allOptionValue && activeMultiValues.includes(o.value));
  }, [multiple, options, allOptionValue, activeMultiValues]);

  const allOption = useMemo(() => {
    return options.find((o) => o.value === allOptionValue);
  }, [options, allOptionValue]);

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

    if (multiple) {
      if (optValue === allOptionValue) {
        onMultiChange?.([]);
        return;
      }
      const exists = activeMultiValues.includes(optValue);
      const next = exists
        ? activeMultiValues.filter((v) => v !== optValue)
        : [...activeMultiValues, optValue];
      onMultiChange?.(next);
      return;
    }

    onChange?.(optValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const hasActiveMultiFilter = multiple && selectedMultiOptions.length > 0;

  return (
    <div ref={containerRef} className={`relative inline-block text-xs ${className}`} id={id}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg bg-[#080C14] hover:bg-slate-900 text-slate-200 border transition-all cursor-pointer focus:outline-none focus:border-emerald-500/60 ${
          isOpen
            ? 'border-emerald-500/70 ring-1 ring-emerald-500/25'
            : hasActiveMultiFilter
            ? 'border-emerald-500/45 bg-emerald-950/15'
            : 'border-slate-800 hover:border-slate-700'
        }`}
      >
        {multiple ? (
          <div className="flex items-center gap-1.5 truncate min-w-0">
            {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
            {selectedMultiOptions.length === 0 ? (
              <span className="truncate font-medium">
                {allOption ? allOption.label : <span className="text-slate-500">{placeholder}</span>}
              </span>
            ) : selectedMultiOptions.length === 1 ? (
              <>
                {selectedMultiOptions[0].color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: selectedMultiOptions[0].color }}
                  />
                )}
                <span className="truncate font-semibold text-emerald-300">
                  {selectedMultiOptions[0].label}
                </span>
                {selectedMultiOptions[0].badge && (
                  <span className="text-[10px] text-slate-400 font-mono tabular-nums shrink-0">
                    {selectedMultiOptions[0].badge}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/35 text-emerald-300 font-mono text-[10px] font-bold tabular-nums shrink-0">
                  {selectedMultiOptions.length}
                </span>
                <span className="truncate font-semibold text-emerald-200">
                  {selectedMultiOptions.map((o) => o.label).join(', ')}
                </span>
              </>
            )}
          </div>
        ) : (
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
        )}

        <div className="flex items-center gap-1 shrink-0">
          {hasActiveMultiFilter && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onMultiChange?.([]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onMultiChange?.([]);
                }
              }}
              title="Reset filter to All"
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-emerald-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu Popover with max height & scroll */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-1.5 min-w-[190px] w-max max-w-xs sm:max-w-sm bg-[#0D131F] border border-slate-700/90 rounded-xl shadow-2xl z-50 py-1 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 ${menuClassName}`}
          style={{ width: 'max(100%, 190px)' }}
        >
          {/* Multi-select status & quick reset bar */}
          {multiple && (
            <div className="px-3 py-1.5 border-b border-slate-800/80 bg-[#080C14]/95 flex items-center justify-between gap-2 text-[10px]">
              <span className="text-slate-400 font-medium">
                {isAllMultiSelected
                  ? 'All selected'
                  : `${selectedMultiOptions.length} selected`}
              </span>
              {!isAllMultiSelected && (
                <button
                  type="button"
                  onClick={() => onMultiChange?.([])}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                >
                  Reset to All
                </button>
              )}
            </div>
          )}

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
                const isSelected = multiple
                  ? opt.value === allOptionValue
                    ? isAllMultiSelected
                    : activeMultiValues.includes(opt.value)
                  : opt.value === value;

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
                      {multiple && (
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                              : 'border-slate-700 bg-slate-900/90 text-transparent'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
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
                    {!multiple && isSelected && (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                    )}
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

