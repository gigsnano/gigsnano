import Image, { type ImageProps } from "next/image";

import { resolveProjectCoverUrl } from "@/lib/format/resolve-project-cover-url";

type ProjectCoverImageProps = Omit<ImageProps, "src" | "alt"> & {
  src: string | null | undefined;
  alt?: string;
};

/** Project cover image with a safe fallback when the URL host is not allowlisted. */
export function ProjectCoverImage({ src, alt = "", ...props }: ProjectCoverImageProps) {
  return <Image src={resolveProjectCoverUrl(src)} alt={alt} {...props} />;
}
