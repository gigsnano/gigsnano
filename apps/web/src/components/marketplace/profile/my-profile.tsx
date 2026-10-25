"use client";

import { useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CheckmarkBadge01Icon,
  Image02Icon,
  LanguageSkillIcon,
  Clock01Icon,
  PlusSignCircleIcon,
  Share01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useIsClient } from "@/hooks/ui/use-is-client";
import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";
import { MARKETPLACE_COMPANY_SIZES, MARKETPLACE_INDUSTRIES, MARKETPLACE_SKILLS } from "@/constants/marketplace";
import {
  EVerifyStatus,
  useMarketplaceProfileStore,
  type IPortfolioProject,
} from "@/store/ui/marketplace-profile.store";
import { EMarketplaceRole } from "@/types";

import { AvatarCircle } from "../shared/avatar-circle";
import { ConnectsCard, PromoteCard } from "../home/rail-cards";
import { EditIconButton, InlineEdit } from "./inline-edit";
import { LanguagesDialog } from "./languages-dialog";
import { HoursPerWeekPopover } from "./hours-per-week-popover";
import { PortfolioDialog } from "./portfolio-dialog";
import { ShareDialog } from "./share-dialog";
import { VerifyDialog } from "./verify-dialog";
import { VideoIntroDialog } from "./video-intro-dialog";

const selectField =
  "h-9 w-full cursor-pointer rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function SidebarEntry({
  icon,
  title,
  children,
  action,
}: {
  icon: typeof Clock01Icon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t px-1 py-4 first:border-t-0">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
          {title}
        </p>
        {children && <div className="mt-1 pl-6 text-sm text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Editable skills chip list with vocabulary suggestions (max 10). */
function SkillsEditor() {
  const skills = useMarketplaceProfileStore((s) => s.skills);
  const updateProfile = useMarketplaceProfileStore((s) => s.updateProfile);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const skill = raw.trim();
    if (!skill || skills.length >= 10) return;
    if (skills.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    updateProfile({ skills: [...skills, skill] });
    setDraft("");
  };
  const remove = (skill: string) => updateProfile({ skills: skills.filter((s) => s !== skill) });

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add(draft);
    }
  };

  const suggestions = MARKETPLACE_SKILLS.filter(
    (s) => !skills.includes(s) && (!draft || s.toLowerCase().includes(draft.toLowerCase())),
  ).slice(0, 6);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Skills</h2>
        <EditIconButton
          label={editing ? "Done editing skills" : "Edit skills"}
          onClick={() => setEditing((e) => !e)}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {skills.length === 0 && !editing && (
          <p className="text-sm text-muted-foreground">Add skills so clients can find you.</p>
        )}
        {skills.map((skill) => (
          <span
            key={skill}
            className="flex items-center gap-1 rounded-full bg-secondary py-1 pl-2.5 pr-1.5 text-xs font-medium text-secondary-foreground"
          >
            {skill}
            {editing && (
              <button
                type="button"
                aria-label={`Remove ${skill}`}
                onClick={() => remove(skill)}
                className="flex size-4 items-center justify-center rounded-full transition-colors hover:bg-foreground/10"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
              </button>
            )}
          </span>
        ))}
      </div>
      {editing && (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a skill and press Enter"
            aria-label="Add skill"
            className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Suggested skills">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => add(s)}
                  className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One project tile (transitions.dev stagger: 300ms fade+rise, ease-out,
 * 40ms/item offset capped at 6 — matches the entrance rhythm already used
 * for the languages list in this file). Click opens the dialog in edit mode.
 */
function PortfolioCard({
  project,
  index,
  onClick,
}: {
  project: IPortfolioProject;
  index: number;
  onClick: () => void;
}) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = project.image_url && !imageBroken;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
      className={cn(
        "group/portfolio flex flex-col overflow-hidden rounded-xl border bg-card text-left",
        "transition-[border-color,box-shadow,transform] duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-0 active:scale-[0.99]",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out",
      )}
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
            className="object-cover transition-transform duration-300 ease-out group-hover/portfolio:scale-[1.03]"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/40">
            <HugeiconsIcon icon={Image02Icon} className="size-8" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <h3 className="truncate text-sm font-semibold">{project.title}</h3>
        {project.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{project.description}</p>
        ) : null}
      </div>
    </button>
  );
}

function PortfolioSection() {
  const portfolio = useMarketplaceProfileStore((s) => s.portfolio);
  const [tab, setTab] = useState(0);
  const { barRef, pillRef } = useSlidingTabs(tab);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IPortfolioProject | null>(null);

  const shown = portfolio.filter((p) => (tab === 0 ? p.published : !p.published));
  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: IPortfolioProject) => {
    setEditing(p);
    setDialogOpen(true);
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Portfolio</h2>
        <EditIconButton label="Add a portfolio project" icon={PlusSignCircleIcon} onClick={openCreate} />
      </div>
      <div ref={barRef} className="relative mt-2 flex gap-1 border-b" role="tablist">
        <span
          ref={pillRef}
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary"
          style={{ transition: "transform var(--tabs-dur) var(--tabs-ease), width var(--tabs-dur) var(--tabs-ease)" }}
          aria-hidden
        />
        {["Published", "Drafts"].map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={i === tab}
            data-tab-index={i}
            onClick={() => setTab(i)}
            className={cn(
              "relative z-[1] px-3 py-2 text-sm font-medium transition-colors duration-150",
              i === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          assetKey="project"
          title={tab === 0 ? "Show off your best work" : "No drafts yet"}
          description="Talent are hired far more often when they've published a portfolio."
          actions={[{ label: "Add a project", onClick: openCreate }]}
          className="py-8"
        />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {shown.map((p, i) => (
            <PortfolioCard key={p.id} project={p} index={i} onClick={() => openEdit(p)} />
          ))}
        </div>
      )}

      <PortfolioDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editing} />
    </section>
  );
}

/** Own-profile editor page (freelancer profile settings anatomy). */
export function MyProfile() {
  const profile = useMarketplaceProfileStore();
  const updateProfile = useMarketplaceProfileStore((s) => s.updateProfile);
  const mounted = useIsClient();
  const [langOpen, setLangOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  if (!mounted) return <div className="h-64 rounded-xl border bg-card" aria-hidden />;

  const freelancer = profile.role === EMarketplaceRole.Freelancer;

  return (
    <div>
      {/* Header card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-5">
          <AvatarCircle name={profile.display_name || "?"} availableNow={freelancer} size="lg" />
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={profile.display_name}
              placeholder="Your name"
              label="display name"
              onSave={(v) => v && updateProfile({ display_name: v })}
              display={
                <span className="flex items-center gap-2">
                  <span className="text-2xl font-semibold tracking-tight">
                    {profile.display_name || "Your name"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVerifyOpen(true)}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Verify your identity
                  </button>
                </span>
              }
            />
            <p className="mt-1 text-sm text-muted-foreground">
              {freelancer ? "Freelancer" : `Client · ${profile.company_name || "your company"}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/marketplace/profile/preview">See public view</Link>
            </Button>
            <Button asChild>
              <Link href="/marketplace/profile/settings">Profile settings</Link>
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Share profile" onClick={() => setShareOpen(true)}>
              <HugeiconsIcon icon={Share01Icon} className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[300px_1fr]">
        {/* Left column */}
        <aside className="flex flex-col gap-4 self-start">
          <div className="rounded-xl bg-primary/8 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              GigsNano Market
            </p>
            <p className="mt-1.5 text-sm">
              Keep your profile visible during breaks and stand out in search.
            </p>
          </div>

          <PromoteCard />
          <ConnectsCard />

          <div className="rounded-xl border bg-card px-4 py-1">
            <SidebarEntry
              icon={Video01Icon}
              title="Video introduction"
              action={
                <EditIconButton
                  label={profile.video_intro_url ? "Edit video introduction" : "Add a video introduction"}
                  icon={profile.video_intro_url ? undefined : PlusSignCircleIcon}
                  onClick={() => setVideoOpen(true)}
                />
              }
            >
              {profile.video_intro_url ? (
                <a
                  href={profile.video_intro_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Added
                </a>
              ) : undefined}
            </SidebarEntry>
            <SidebarEntry
              icon={Clock01Icon}
              title="Hours per week"
              action={
                <HoursPerWeekPopover>
                  <EditIconButton label="Edit hours per week" />
                </HoursPerWeekPopover>
              }
            >
              {profile.hours_per_week || <span className="text-muted-foreground">Add your availability</span>}
            </SidebarEntry>
            <SidebarEntry
              icon={LanguageSkillIcon}
              title="Languages"
              action={<EditIconButton label="Edit languages" onClick={() => setLangOpen(true)} />}
            >
              {profile.languages.length > 0 ? (
                <span className="flex flex-col gap-0.5">
                  {profile.languages.map((l) => (
                    <span key={l.name}>
                      {l.name}: {l.proficiency}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-muted-foreground">Add languages</span>
              )}
            </SidebarEntry>
            <SidebarEntry icon={CheckmarkBadge01Icon} title="Verifications">
              ID: {profile.identity_verification === EVerifyStatus.Verified ? "Verified" : "Unverified"}{" "}
              {profile.identity_verification !== EVerifyStatus.Verified && (
                <button
                  type="button"
                  onClick={() => setVerifyOpen(true)}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Verify
                </button>
              )}
            </SidebarEntry>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-8">
          {freelancer ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <InlineEdit
                    value={profile.title}
                    placeholder="Add a professional title"
                    label="professional title"
                    onSave={(v) => updateProfile({ title: v })}
                    display={<span className="text-lg font-semibold leading-snug">{profile.title || "Add a professional title"}</span>}
                  />
                </div>
                <div className="w-40 shrink-0">
                  <InlineEdit
                    value={profile.hourly_rate != null ? String(profile.hourly_rate) : ""}
                    placeholder="Set a rate"
                    label="hourly rate"
                    type="number"
                    onSave={(v) => updateProfile({ hourly_rate: v ? Number(v) : null })}
                    display={
                      <span className="text-lg font-semibold tabular-nums">
                        {profile.hourly_rate != null ? `$${Number(profile.hourly_rate).toFixed(2)}/hr` : "Set a rate"}
                      </span>
                    }
                  />
                </div>
              </div>

              <section className="border-t pt-6">
                <InlineEdit
                  value={profile.overview}
                  placeholder="Help people get to know you at a glance. What work do you do best? Tell them clearly, using paragraphs or bullet points."
                  label="overview"
                  multiline
                  onSave={(v) => updateProfile({ overview: v })}
                  display={
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                      {profile.overview ||
                        "Help people get to know you at a glance. What work do you do best? Tell them clearly, using paragraphs or bullet points."}
                    </p>
                  }
                />
              </section>

              <section className="border-t pt-6">
                <PortfolioSection />
              </section>

              <section className="border-t pt-6">
                <h2 className="text-base font-semibold">Work history</h2>
                <EmptyState
                  assetKey="project"
                  title="No work history yet"
                  description="Completed contracts on GigsNano Market will appear here."
                  actions={[{ label: "Find work", href: "/marketplace/jobs" }]}
                  align="start"
                  className="px-0 py-8"
                />
              </section>

              <section className="border-t pt-6">
                <SkillsEditor />
              </section>
            </>
          ) : (
            <section>
              <h2 className="text-base font-semibold">About your company</h2>
              <div className="mt-4 flex max-w-md flex-col gap-4">
                <InlineEdit
                  value={profile.company_name}
                  placeholder="Add your company name"
                  label="company name"
                  onSave={(v) => updateProfile({ company_name: v })}
                  display={<span className="text-sm font-medium">{profile.company_name || "Add your company name"}</span>}
                />
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Industry
                  <select
                    value={profile.industry}
                    onChange={(e) => updateProfile({ industry: e.target.value })}
                    className={selectField}
                  >
                    {MARKETPLACE_INDUSTRIES.map((industry) => (
                      <option key={industry}>{industry}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Company size
                  <select
                    value={profile.company_size}
                    onChange={(e) => updateProfile({ company_size: e.target.value })}
                    className={selectField}
                  >
                    {MARKETPLACE_COMPANY_SIZES.map((size) => (
                      <option key={size}>{size}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}
        </div>
      </div>

      <LanguagesDialog open={langOpen} onOpenChange={setLangOpen} />
      <VideoIntroDialog open={videoOpen} onOpenChange={setVideoOpen} />
      <VerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
