"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { departmentsSearchSchema, type DepartmentsSearchValues } from "@/schemas/admin/forms/departments";


interface DepartmentsSearchFormProps {
  initialQuery: string;
}

export function DepartmentsSearchForm({ initialQuery }: DepartmentsSearchFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const form = useForm<DepartmentsSearchValues>({
    resolver: zodResolver(departmentsSearchSchema),
    defaultValues: {
      q: initialQuery,
    },
    mode: "onChange",
  });

  const updateSearch = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const trimmed = value.trim();

    if (!trimmed) {
      params.delete("q");
    } else {
      params.set("q", trimmed);
    }

    const queryString = params.toString();
    const url = queryString ? `${pathname}?${queryString}` : pathname;
    router.push(url);
  };

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="q"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sr-only">Rechercher un département</FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="Rechercher un département..."
                className="h-9 text-sm"
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e);
                  const raw = e.target.value;
                  void form.trigger("q").then((ok) => {
                    if (ok) {
                      updateSearch(raw);
                    }
                  });
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}
