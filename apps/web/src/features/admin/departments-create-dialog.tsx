"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateDepartmentForm } from "@/features/admin/create-department-form";

interface DepartmentsCreateDialogProps {
  action: (formData: FormData) => void | Promise<void>;
}

export function DepartmentsCreateDialog({ action }: DepartmentsCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>Nouveau département</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau département</DialogTitle>
          <DialogDescription>
            Créez un nouveau département disponible pour votre équipe.
          </DialogDescription>
        </DialogHeader>
        <CreateDepartmentForm
          action={action}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
