import { useState } from "react";
import { ChevronDownIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
  /** Accessible name for the trigger (axe requires one for role=combobox). */
  ariaLabel: string;
}

/**
 * Canonical shadcn multi-select combobox (Popover + Command). Used for
 * Bargaining Council registration pickers where more than one council can
 * apply to a contractor.
 */
export function MultiSelectCombobox({
  options,
  selected,
  onToggle,
  onClear,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  disabled = false,
  className,
  testId = "multi-select",
  ariaLabel,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const selectedOptions = options.filter((o) => selectedSet.has(o.value));

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              aria-label={ariaLabel}
              data-testid={`${testId}-trigger`}
              disabled={disabled}
              className={cn(
                "flex min-h-[42px] w-full items-center justify-between gap-2 rounded-sm border border-input bg-white px-3 py-2 text-left text-sm transition-colors outline-none hover:border-zinc-400 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                !open && "aria-expanded:border-ring",
              )}
            />
          }
        >
          {selectedOptions.length === 0 ? (
            <span className="text-zinc-500">{placeholder}</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              {selectedOptions.map((o) => (
                <Badge key={o.value} className="rounded-sm px-2 py-0.5 uppercase" title={o.label}>
                  {o.label}
                  <button
                    type="button"
                    aria-label={`Remove ${o.label}`}
                    data-testid={`bc-chip-remove-${o.value}`}
                    className="-mr-1 inline-flex items-center justify-center rounded-sm p-0.5 hover:bg-zinc-700/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onToggle(o.value);
                    }}
                  >
                    <XIcon aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </span>
          )}
          <ChevronDownIcon
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-zinc-500 opacity-70"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0" data-testid={testId}>
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const isSelected = selectedSet.has(o.value);
                  return (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.description ?? ""}`}
                      onSelect={() => onToggle(o.value)}
                      data-checked={isSelected}
                      data-testid={`${testId}-option-${o.value}`}
                      className="py-2"
                    >
                      <span className="text-xs font-bold tracking-[0.08em] text-zinc-900 uppercase">
                        {o.label}
                      </span>
                      {o.description && (
                        <span className="text-[10px] font-semibold tracking-[0.1em] text-zinc-500 uppercase">
                          {o.description}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedOptions.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          data-testid={`${testId}-clear`}
          className="mt-2 text-[11px] font-semibold tracking-[0.08em] text-zinc-500 uppercase transition-colors hover:text-zinc-900"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
