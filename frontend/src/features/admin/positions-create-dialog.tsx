"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotification } from "@/contexts/notification-context";
import { Textarea } from "@/components/ui/textarea";

interface PositionsCreateDialogProps {
  departments: { id: string; name: string }[];
  action: (formData: FormData) => void | Promise<void>;
}

export function PositionsCreateDialog({ departments, action }: PositionsCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { showSuccess, showError } = useNotification();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      await action(formData);
      showSuccess("Poste créé avec succès");
      setOpen(false);
      router.refresh();
    } catch {
      showError("Erreur lors de la création du poste");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="cursor-pointer">
          <Plus className="h-4 w-4" />
          <span>Nouveau poste</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau poste</DialogTitle>
          <DialogDescription>
            Créez un nouveau poste pour un département.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-position-name">Nom du poste</Label>
            <Input
              id="new-position-name"
              name="name"
              placeholder="Ex: Développeur, Manager, etc."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-position-department">Département</Label>
            <Select name="departmentId" required>
              <SelectTrigger id="new-position-department" className="w-full">
                <SelectValue placeholder="Sélectionner un département"/>
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-position-description">Description</Label>
            <Textarea
              id="new-position-description"
              name="description"
              placeholder="Description du poste (optionnel)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="submit" className="cursor-pointer">
              <Check className="h-4 w-4" />
              <span>Créer</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
