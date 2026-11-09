"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "../ui/label";

type Department = {
  id: string;
  name: string;
};

interface PositionsFilterProps {
  departments: Department[];
  selectedDepartment: string;
}

export function PositionsFilter({ departments, selectedDepartment }: PositionsFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString());

    if (value === "all") {
      params.delete("department");
    } else {
      params.set("department", value);
    }

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  if (departments.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="space-y-2">
        <Label htmlFor="department" className="text-sm text-muted-foreground">
          Filtrer par département
        </Label>
        <Select value={selectedDepartment} onValueChange={handleChange}>
          <SelectTrigger id="department" className="h-9 w-56 text-sm">
            <SelectValue placeholder="Tous les départements" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les départements</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
