export function SkillTags({ skills, max }: { skills: string[]; max?: number }) {
  const visible = max ? skills.slice(0, max) : skills;
  const overflow = skills.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((skill) => (
        <span
          key={skill}
          className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
        >
          {skill}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}
