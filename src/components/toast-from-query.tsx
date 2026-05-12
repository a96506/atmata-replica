"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePathname, useRouter } from "@/i18n/navigation";

const TOAST_TYPES = ["success", "error", "info", "warning"] as const;
type ToastType = (typeof TOAST_TYPES)[number];

function isToastType(v: string): v is ToastType {
  return (TOAST_TYPES as readonly string[]).includes(v);
}

export function ToastFromQuery() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  const type = searchParams.get("toast");
  const msg = searchParams.get("toast_msg");

  useEffect(() => {
    if (!type || fired.current) return;
    fired.current = true;

    const message = msg ? decodeURIComponent(msg) : type;
    if (isToastType(type)) {
      toast[type](message);
    } else {
      toast(message);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("toast");
    params.delete("toast_msg");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [type, msg, searchParams, router, pathname]);

  return null;
}
