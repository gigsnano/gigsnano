"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, CheckmarkBadge01Icon, Image02Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { useIsClient } from "@/hooks/ui/use-is-client";
import {
  EVerifyStatus,
  useMarketplaceProfileStore,
  type IPortfolioProject,
} from "@/store/ui/marketplace-profile.store";
import { EMarketplaceRole } from "@/types";

import { AvatarCircle } from "../shared/avatar-circle";
import { SkillTags } from "../shared/skill-tags";

// Shared stagger entrance (same recipe as profile-settings.tsx / my-profile.tsx
// portfolio cards): gentle fade+rise, ease-out, fill-mode-backwards so the
// per-section `animationDelay` holds the hidden state instead of flashing.
const ENTER =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out";

/** Read-only portfolio tile — same visual language as my-profile's PortfolioCard, minus the click affordance. */
function PortfolioPreviewCard({ project, index }: { project: IPortfolioProject; index: number }) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = project.image_url && !imageBroken;

  return (
    <div
      style={{ animationDelay: `${160 + Math.min(index, 6) * 40}ms` }}
      className={`flex flex-col overflow-hidden rounded-xl border bg-card ${ENTER}`}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {showImage ? (
          <Image
            key={project.image_url}
            src={project.image_url}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/40">
            <HugeiconsIcon icon={Image02Icon} className="size-8" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <h3 className="truncate text-sm font-semibold">{project.title}</h3>
        {project.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{project.description}</p>
        ) : null}
        {project.skills.length > 0 && (
          <div className="mt-1">
            <SkillTags skills={project.skills} max={4} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only public profile preview — mirrors the anatomy of
 * `talent/freelancer-profile.tsx` (header band → sticky aside → main column)
 * but sources every field from the local `marketplace-profile` store instead
 * of a fetched freelancer record. No store writes happen here.
 */
export function ProfilePreview() {
  const p = useMarketplaceProfileStore();
  const mounted = useIsClient();
  if (!mounted) return <div className="h-64 rounded-xl border bg-card" aria-hidden />;

  const freelancer = p.role === EMarketplaceRole.Freelancer;
  const verified = p.identity_verification === EVerifyStatus.Verified;
  const publishedPortfolio = p.portfolio.filter((project) => project.published);
  const hasFreelancerContent = p.overview || publishedPortfolio.length > 0 || p.skills.length > 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/marketplace/profile"
          className="group/back inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            className="size-4 transition-transform duration-150 ease-out group-hover/back:-translate-x-0.5"
          />
          Back to editor
        </Link>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Preview · how clients see you
        </span>
      </div>

      {/* Header band */}
      <div className={`rounded-xl border bg-card p-6 ${ENTER}`} style={{ animationDelay: "0ms" }}>
        <div className="flex flex-wrap items-center gap-5">
          <AvatarCircle name={p.display_name || "?"} availableNow={freelancer} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{p.display_name || "Unnamed"}</h1>
              {verified && (
                <HugeiconsIcon
                  icon={CheckmarkBadge01Icon}
                  className="size-5 shrink-0 text-primary"
                  aria-label="Identity verified"
                />
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {freelancer
                ? p.title || "Freelancer"
                : [p.company_name || "Company", p.industry].filter(Boolean).join(" · ")}
            </p>
          </div>
          {freelancer && p.hourly_rate != null && (
            <p className="text-lg font-semibold tabular-nums">${Number(p.hourly_rate).toFixed(2)}/hr</p>
          )}
        </div>
      </div>

      {freelancer ? (
        <div className="mt-8 grid gap-10 lg:grid-cols-[260px_1fr]">
          {/* Sticky aside — hours / languages / verifications, mirrors freelancer-profile.tsx */}
          <aside className={`flex flex-col gap-6 self-start text-sm lg:sticky lg:top-20 ${ENTER}`} style={{ animationDelay: "40ms" }}>
            <div>
              <h2 className="font-semibold">Hours per week</h2>
              <p className="mt-1 text-muted-foreground">{p.hours_per_week || "Not specified"}</p>
            </div>
            <div>
              <h2 className="font-semibold">Languages</h2>
              {p.languages.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                  {p.languages.map((lang) => (
                    <li key={lang.name}>
                      {lang.name}: {lang.proficiency}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">Not specified</p>
              )}
            </div>
            <div>
              <h2 className="font-semibold">Verifications</h2>
              <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                {verified ? (
                  <>
                    <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-4 shrink-0 text-primary" />
                    Identity verified
                  </>
                ) : (
                  "Not verified"
                )}
              </p>
            </div>
          </aside>

          {/* Main column */}
          <div className="min-w-0">
            {hasFreelancerContent ? (
              <div className="flex flex-col gap-8">
                {p.overview && (
                  <section className={ENTER} style={{ animationDelay: "80ms" }}>
                    <h2 className="text-base font-semibold">Overview</h2>
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                      {p.overview}
                    </p>
                  </section>
                )}

                {publishedPortfolio.length > 0 && (
                  <section className={`border-t pt-6 ${ENTER}`} style={{ animationDelay: "120ms" }}>
                    <h2 className="text-base font-semibold">Portfolio</h2>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {publishedPortfolio.map((project, index) => (
                        <PortfolioPreviewCard key={project.id} project={project} index={index} />
                      ))}
                    </div>
                  </section>
                )}

                {p.skills.length > 0 && (
                  <section className={`border-t pt-6 ${ENTER}`} style={{ animationDelay: "200ms" }}>
                    <h2 className="text-base font-semibold">Skills</h2>
                    <div className="mt-3">
                      <SkillTags skills={p.skills} />
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <EmptyState
                assetKey="generic"
                title="Nothing to show yet"
                description="Fill out your overview, skills, or portfolio so clients see a full picture of your work."
                actions={[{ label: "Edit profile", href: "/marketplace/profile" }]}
                align="start"
                className="px-0 py-8"
              />
            )}
          </div>
        </div>
      ) : (
        <section className={`mt-8 rounded-xl border bg-card p-6 text-sm ${ENTER}`} style={{ animationDelay: "40ms" }}>
          <h2 className="text-base font-semibold">About the company</h2>
          <dl className="mt-3 flex flex-col gap-2">
            <div className="flex gap-1.5">
              <dt className="font-medium">Industry:</dt>
              <dd className="text-muted-foreground">{p.industry || "Not specified"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium">Company size:</dt>
              <dd className="text-muted-foreground">{p.company_size || "Not specified"}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
