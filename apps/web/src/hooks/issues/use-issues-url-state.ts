"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { readGigsqlParam, writeGigsqlParam } from "@/lib/issues/issues-url-state";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";

/** Keep the shareable `?gigsql=` param in sync with filter editor state. */
export function useIssuesUrlState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const gigsqlQuery = useIssuesViewStore((s) => s.gigsqlQuery);
  const setGigsqlQuery = useIssuesViewStore((s) => s.setGigsqlQuery);
  const restored = useRef(false);

  useEffect(() => {
    const fromUrl = readGigsqlParam(searchParams);
    if (fromUrl) setGigsqlQuery(fromUrl);
    restored.current = true;
  }, [searchParams, setGigsqlQuery]);

  useEffect(() => {
    if (!restored.current) return;

    const next = writeGigsqlParam(new URLSearchParams(searchParams.toString()), gigsqlQuery);
    const qs = next.toString();
    if (qs === searchParams.toString()) return;

    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [gigsqlQuery, pathname, router, searchParams]);
}
