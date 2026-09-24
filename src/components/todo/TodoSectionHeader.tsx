import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  accessory?: ReactNode;
  onClick?: () => void;
  expanded?: boolean;
  id?: string;
}

/** iOS-style grouped-list section label. Content rows are not glass cards. */
export function TodoSectionHeader({ title, accessory, onClick, expanded, id }: Props) {
  const className = cn(
    "w-full flex items-center justify-between gap-3 px-1 pt-5 pb-1.5",
    onClick && "cursor-pointer",
  );
  const body = (
    <>
      <h2
        id={id}
        className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </h2>
      {accessory ? (
        <span className="text-[13px] text-muted-foreground shrink-0">{accessory}</span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-expanded={expanded}
      >
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
