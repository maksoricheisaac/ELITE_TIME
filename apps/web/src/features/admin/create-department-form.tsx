"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createDepartmentFormSchema, type CreateDepartmentFormValues } from "@/schemas/admin/forms/departments";
import { useNotification } from "@/contexts/notification-context";
import { Textarea } from "@/components/ui/textarea";


interface CreateDepartmentFormProps {
  action: (formData: FormData) => void | Promise<void>;
  onSuccess?: () => void;
}

export function CreateDepartmentForm({ action, onSuccess }: CreateDepartmentFormProps) {
  const [isPending, startTransition] = useTransition();
  const { showSuccess, showError } = useNotification();
  const form = useForm<CreateDepartmentFormValues>({
    resolver: zodResolver(createDepartmentFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
    mode: "onSubmit",
  });

  const onSubmit = (values: CreateDepartmentFormValues) => {
    startTransition(() => {
      const formData = new FormData();
      formData.append("name", values.name);
      if (values.description) {
        formData.append("description", values.description);
      }

      void Promise.resolve(action(formData))
        .then(() => {
          showSuccess("Département créé avec succès");
          if (onSuccess) {
            onSuccess();
          }
        })
        .catch(() => {
          showError("Erreur lors de la création du département");
        });
    });
  };

  return (
    <Form {...form}>
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom du département</FormLabel>
                <FormControl>
                  <Input
                    id="new-department-name"
                    placeholder="Ex: Informatique, Ressources humaines..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description du département</FormLabel>
                <FormControl>
                  <Textarea
                    id="new-department-description"
                    placeholder="Description courte du département (optionnel)"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            className="cursor-pointer"
            type="submit"
            disabled={form.formState.isSubmitting || isPending}
          >
            Créer
          </Button>
        </div>
      </form>
    </Form>
  );
}
