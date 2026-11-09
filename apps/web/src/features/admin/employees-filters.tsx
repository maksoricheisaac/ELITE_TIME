"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { employeesFiltersSchema, type EmployeesFiltersValues } from "@/schemas/admin/forms/employees";

interface DepartmentOption {
  id: string;
  name: string;
}

interface EmployeesFiltersProps {
  departments: DepartmentOption[];
}

export function EmployeesFilters({ departments }: EmployeesFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSearch = searchParams?.get("search") ?? "";
  const currentDepartment = searchParams?.get("department") ?? "all";
  const currentRoleParam = searchParams?.get("role");
  const currentRole: EmployeesFiltersValues["role"] =
    currentRoleParam === "employee" ||
    currentRoleParam === "manager" ||
    currentRoleParam === "admin" ||
    currentRoleParam === "all"
      ? currentRoleParam
      : "all";

  const form = useForm<EmployeesFiltersValues>({
    resolver: zodResolver(employeesFiltersSchema),
    defaultValues: { search: currentSearch, department: currentDepartment, role: currentRole },
    mode: "onChange",
  });

  const updateSearchParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (value === null || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete("page");
      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [router, pathname, searchParams]
  );

  return (
    <Form {...form}>
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
        {/* Recherche */}
        <FormField
          control={form.control}
          name="search"
          render={({ field }) => (
            <FormItem className="sm:flex-shrink-0">
              <FormLabel className="text-xs font-medium text-muted-foreground">Recherche</FormLabel>
              <FormControl>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Nom, email, poste…"
                    className="h-9 w-full sm:w-52 md:w-64 pl-8 text-sm"
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e);
                      void form.trigger("search").then((ok) => {
                        if (ok) updateSearchParam("search", e.target.value);
                      });
                    }}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Département */}
        {departments.length > 0 && (
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem className="sm:flex-shrink-0">
                <FormLabel className="text-xs font-medium text-muted-foreground">Département</FormLabel>
                <FormControl>
                  <Select
                    value={field.value ?? currentDepartment}
                    onValueChange={(value) => {
                      field.onChange(value);
                      void form.trigger("department").then((ok) => {
                        if (ok) updateSearchParam("department", value);
                      });
                    }}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[160px]">
                      <SelectValue placeholder="Tous les départements" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les départements</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.name}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Rôle */}
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem className="sm:flex-shrink-0">
              <FormLabel className="text-xs font-medium text-muted-foreground">Rôle</FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? currentRole}
                  onValueChange={(value) => {
                    field.onChange(value);
                    void form.trigger("role").then((ok) => {
                      if (ok) updateSearchParam("role", value);
                    });
                  }}
                >
                  <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[140px]">
                    <SelectValue placeholder="Tous les rôles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les rôles</SelectItem>
                    <SelectItem value="employee">Employé</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </Form>
  );
}
