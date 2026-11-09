"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { format } from "date-fns"
import { ChevronDownIcon } from "lucide-react"

interface DatePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Sélectionner une date",
  className,
}: DatePickerProps) {
  const [internalDate, setInternalDate] = React.useState<Date | undefined>(value)

  const date = value ?? internalDate

  const handleSelect = (selected?: Date) => {
    if (onChange) {
      onChange(selected)
    } else {
      setInternalDate(selected)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-empty={!date}
          className={`data-[empty=true]:text-muted-foreground w-[212px] justify-between text-left font-normal ${className ?? ""} cursor-pointer`}
        >
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
          <ChevronDownIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          defaultMonth={date}
        />
      </PopoverContent>
    </Popover>
  )
}

export function DatePickerDemo() {
  const [date, setDate] = React.useState<Date | undefined>()

  return <DatePicker value={date} onChange={setDate} />
}
