"use client";

import { Building2 } from "lucide-react";
import { useSession } from "@/lib/session";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CompanySwitcher({ label }: { label: string }) {
  const { companies, companyId, setCompanyId } = useSession();

  return (
    <Select value={companyId} onValueChange={setCompanyId}>
      <SelectTrigger
        size="sm"
        className="w-[180px] gap-2"
        aria-label={label}
      >
        <Building2 className="text-muted-foreground size-4 shrink-0" />
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
