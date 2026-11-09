"use client";

import { useMemo, useCallback, useState, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { CalendarRange } from "@/components/ui/calendar-range";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";

function toISODate(date: Date): string {
  // Formatte la date en AAAA-MM-JJ en utilisant le fuseau local (sans passer par l'UTC)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parts = value.split("-").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;

  // Construit la date en local (année, mois-1, jour) pour éviter les décalages liés à l'UTC
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Debounce hook for performance optimization
function useDebounce<T extends (value: DateRange | undefined) => void>(
  callback: T,
  delay: number
): (value: DateRange | undefined) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((value: DateRange | undefined) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(value);
    }, delay);
  }, [callback, delay]);
}

export function EmployeeReportDateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  // Sync with URL params on mount
  const range: DateRange | undefined = useMemo(() => {
    const fromParam = searchParams?.get("from") ?? undefined;
    const toParam = searchParams?.get("to") ?? undefined;

    // Si aucune date n'est définie dans l'URL, on applique aujourd'hui par défaut
    if (!fromParam && !toParam) {
      const today = new Date();
      const defaultFrom = new Date(today);
      defaultFrom.setHours(0, 0, 0, 0);
      today.setHours(23, 59, 59, 999);

      return { from: defaultFrom, to: today };
    }

    // Sinon, on respecte exactement ce qui est dans l'URL, sans remettre des valeurs par défaut
    const from = fromISODate(fromParam) ?? undefined;
    const to = fromISODate(toParam) ?? undefined;

    return { from, to };
  }, [searchParams]);

  // localRange tracks what the user is editing in the picker.
  // On first render it is undefined; once the user starts picking, it overrides the URL range.
  const [localRangeOverride, setLocalRangeOverride] = useState<DateRange | undefined>(undefined);
  // Use localRangeOverride when the user is mid-pick; otherwise fall back to the URL-derived range.
  const localRange = localRangeOverride ?? range;
  const setLocalRange = setLocalRangeOverride;

  // Debounced navigation to prevent excessive API calls
  const debouncedNavigate = useDebounce((value: DateRange | undefined) => {
    const params = new URLSearchParams(searchParams?.toString());

    if (!value?.from) {
      params.delete("from");
      params.delete("to");
    } else {
      params.set("from", toISODate(value.from));
      if (value.to) {
        params.set("to", toISODate(value.to));
      } else {
        params.delete("to");
      }
    }

    router.push(`${pathname}?${params.toString()}`);
    setIsPending(false);
  }, 400); // 400ms debounce for smooth UX

  // Immediate navigation for complete selections (when both dates are selected)
  const immediateNavigate = useCallback((value: DateRange | undefined) => {
    const params = new URLSearchParams(searchParams?.toString());

    if (!value?.from) {
      params.delete("from");
      params.delete("to");
    } else {
      params.set("from", toISODate(value.from));
      if (value.to) {
        params.set("to", toISODate(value.to));
      } else {
        params.delete("to");
      }
    }

    router.push(`${pathname}?${params.toString()}`);
    setIsPending(false);
  }, [pathname, router, searchParams]);

  // Handle date changes with debouncing for incomplete selections
  const handleChange = useCallback((value: DateRange | undefined) => {
    setLocalRange(value);
    setIsPending(true);

    // If both dates are selected, update immediately
    if (value?.from && value?.to) {
      immediateNavigate(value);
    } else {
      // Otherwise use debounce for partial selections
      debouncedNavigate(value);
    }
  }, [debouncedNavigate, immediateNavigate, setLocalRange]);

  const rangeLabel = useMemo(() => {
    const displayRange = localRange;
    if (!displayRange?.from && !displayRange?.to) return "Choisir une période";

    const fromLabel = displayRange?.from?.toLocaleDateString("fr-FR");
    const toLabel = displayRange?.to?.toLocaleDateString("fr-FR");

    if (fromLabel && !toLabel) return `${fromLabel} – ...`;
    if (!fromLabel && toLabel) return toLabel;
    if (fromLabel && toLabel && fromLabel === toLabel) return fromLabel;

    if (fromLabel && toLabel) {
      return `${fromLabel} – ${toLabel}`;
    }

    return "Choisir une période";
  }, [localRange]);

  return (
    <div suppressHydrationWarning className="">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="employee-report-period"
            type="button"
            variant="outline"
            className="w-full justify-start text-left font-normal cursor-pointer"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarIcon className="mr-2 h-4 w-4" />
            )}
            <span className="truncate">{rangeLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <CalendarRange value={localRange ?? range} onChange={handleChange} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
