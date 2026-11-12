import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  maxHeight?: string;
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
  maxHeight = 'max-h-[45dvh]',
  enableSearch,
  align = 'left',
  icon,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Track viewport size to switch between mobile bottom-sheet and desktop/tablet floating portal
  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Compute portal coordinates relative to trigger button & viewport boundaries
  const updatePosition = useCallback(() => {
    if (!containerRef.current || isMobileViewport) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minMenuWidth = Math.max(rect.width, Math.min(vw * 0.88, 260));
    const maxMenuWidth = Math.min(vw * 0.92, 380);

    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;

    let leftPos = align === 'right' ? rect.right - minMenuWidth : rect.left;
    if (leftPos + minMenuWidth > vw - 12) {
      leftPos = Math.max(12, vw - minMenuWidth - 12);
    }
    if (leftPos < 12) {
      leftPos = 12;
    }

    setPortalStyle({
      position: 'fixed',
      left: `${(leftPos / vw) * 100}vw`,
      width: `clamp(${Math.round(rect.width)}px, ${Math.round(minMenuWidth)}px, ${Math.round(maxMenuWidth)}px)`,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: `${((vh - rect.top + 6) / vh) * 100}dvh` }
        : { top: `${((rect.bottom + 6) / vh) * 100}dvh` }),
    });
  }, [align, isMobileViewport]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    const handleScrollOrResize = (event: Event) => {
      if (menuRef.current && event.target && menuRef.current.contains(event.target as Node)) {
        return;
      }
      updatePosition();
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Only auto-focus search input on desktop/laptop (non-mobile) so virtual keyboard doesn't pop up unexpectedly on phones
  useEffect(() => {
    if (isOpen && !isMobileViewport && searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMobileViewport]);

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

  // Determine if search should be enabled (auto-enabled if >= 7 items unless explicitly set)
  const shouldShowSearch = enableSearch !== undefined ? enableSearch : options.length >= 7;

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

  // Render dropdown menu content (shared between mobile bottom sheet and desktop portal)
  const renderMenuContent = () => (
    <>
      {/* Mobile Sheet Drag Handle & Header */}
      {isMobileViewport && (
        <div className="pt-2.5 pb-2 px-4 border-b border-slate-800/90 bg-[#080C14] flex flex-col gap-1.5 shrink-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-slate-200 tracking-tight">
              {multiple ? 'Select Filter Options' : placeholder}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setSearchTerm('');
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Multi-select status & quick reset bar */}
      {multiple && (
        <div className="px-3.5 py-2 border-b border-slate-800/80 bg-[#080C14]/95 flex items-center justify-between gap-2 text-xs shrink-0">
          <span className="text-slate-400 font-medium">
            {isAllMultiSelected ? 'All selected' : `${selectedMultiOptions.length} selected`}
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
        <div className="p-2 border-b border-slate-800/80 bg-[#080C14]/95 sticky top-0 z-10 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search options..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0D131F] border border-slate-700/90 rounded-xl pl-8 pr-7 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/70"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Options Container with Viewport-Relative Max Height and Smooth Touch Scroll */}
      <div
        className={`${
          isMobileViewport ? 'max-h-[58dvh]' : maxHeight
        } overflow-y-auto overscroll-contain divide-y divide-slate-800/40 custom-scrollbar`}
      >
        {filteredOptions.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-xs italic">
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
                className={`w-full px-3.5 py-2.5 sm:py-2 min-h-[2.75rem] sm:min-h-[2.25rem] text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed text-slate-500'
                    : isSelected
                    ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                    : 'text-slate-200 hover:bg-slate-800/70 active:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0">
                  {multiple && (
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                          : 'border-slate-700 bg-slate-900/90 text-transparent'
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                  {opt.color && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: opt.color }}
                    />
                  )}
                  <div className="truncate min-w-0">
                    <span className="truncate block">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="block text-[0.7rem] text-slate-400 font-normal truncate font-mono tabular-nums mt-0.5">
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                  {opt.badge && (
                    <span className="text-[0.7rem] text-slate-400 font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800">
                      {opt.badge}
                    </span>
                  )}
                </div>
                {!multiple && isSelected && (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <div ref={containerRef} className={`relative inline-block text-xs ${className}`} id={id}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full min-h-[2.4rem] sm:min-h-[2.15rem] flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-xl bg-[#080C14] hover:bg-slate-900 text-slate-200 border transition-all cursor-pointer focus:outline-none focus:border-emerald-500/60 ${
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
                  <span className="text-[0.7rem] text-slate-400 font-mono tabular-nums shrink-0">
                    {selectedMultiOptions[0].badge}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/35 text-emerald-300 font-mono text-[0.7rem] font-bold tabular-nums shrink-0">
                  {selectedMultiOptions.length}
                </span>
                <span className="truncate font-semibold text-emerald-200">
                  {selectedMultiOptions.map((o) => o.label).join(', ')}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 truncate min-w-0">
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
              <span className="text-[0.7rem] text-slate-400 font-mono tabular-nums shrink-0">
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
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-emerald-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Portal Popover / Mobile Slide-Up Bottom Sheet */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          isMobileViewport ? (
            <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-slate-950/75 backdrop-blur-xs">
              <div
                ref={menuRef}
                className={`w-full bg-[#0D131F] border-t border-slate-700/90 rounded-t-3xl shadow-2xl overflow-hidden flex flex-col pb-safe animate-sheet-up ${menuClassName}`}
              >
                {renderMenuContent()}
              </div>
            </div>
          ) : (
            <div
              ref={menuRef}
              style={portalStyle}
              className={`bg-[#0D131F] border border-slate-700/90 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md animate-fade-in ${menuClassName}`}
            >
              {renderMenuContent()}
            </div>
          ),
          document.body
        )}
    </div>
  );
};
