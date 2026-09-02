"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDensity } from "@/components/providers/density-provider";

/**
 * Combined appearance control: colour scheme (light/dark/system) plus row
 * density. Density is a genuine ERP need — power users scanning long document
 * lists want more rows per screen than the comfortable default.
 */
export function ThemeToggle() {
  const t = useTranslations("chrome");
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("appearance")}>
          {mounted && theme === "dark" ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={mounted ? theme : undefined}
            onValueChange={setTheme}
          >
            <DropdownMenuRadioItem value="light">
              <Sun data-icon="inline-start" />
              {t("themeLight")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon data-icon="inline-start" />
              {t("themeDark")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor data-icon="inline-start" />
              {t("themeSystem")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t("density")}</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={density}
            onValueChange={(value) =>
              setDensity(value as "comfortable" | "compact")
            }
          >
            <DropdownMenuRadioItem value="comfortable">
              {t("densityComfortable")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="compact">
              {t("densityCompact")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
