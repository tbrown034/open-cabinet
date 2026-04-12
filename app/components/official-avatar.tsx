"use client";

import { displayName } from "@/lib/format";

interface AvatarProps {
  name: string;
  slug?: string;
  party?: "R" | "D" | "I";
  size?: number;
  showParty?: boolean;
}

function getInitials(name: string): string {
  const full = displayName(name);
  const parts = full.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return full.slice(0, 2).toUpperCase();
}

const partyColors = {
  R: "bg-red-600",
  D: "bg-blue-600",
  I: "bg-neutral-500",
};

export default function OfficialAvatar({
  name,
  slug,
  party,
  size = 40,
  showParty = true,
}: AvatarProps) {
  const initials = getInitials(name);
  const hasPhoto = slug ? true : false; // Photos exist for most officials

  return (
    <div
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      <div className="w-full h-full rounded-full bg-neutral-200 overflow-hidden flex items-center justify-center">
        {slug && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/photos/${slug}.jpg`}
            alt={displayName(name)}
            width={size}
            height={size}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <span
          className="absolute inset-0 flex items-center justify-center text-neutral-500 font-medium select-none leading-none -z-0"
          style={{ fontSize: size * 0.35 }}
        >
          {initials}
        </span>
      </div>

      {showParty && party && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 text-white font-bold rounded-full flex items-center justify-center z-10 ${partyColors[party]}`}
          style={{
            width: Math.max(size * 0.35, 14),
            height: Math.max(size * 0.35, 14),
            fontSize: Math.max(size * 0.2, 8),
          }}
        >
          {party}
        </span>
      )}
    </div>
  );
}
