interface AvatarProps {
  name: string;
  party?: "R" | "D" | "I";
  size?: number;
  showParty?: boolean;
}

function getInitials(name: string): string {
  const parts = name.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    return (parts[1][0] + parts[0][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const partyColors = {
  R: "bg-red-600",
  D: "bg-blue-600",
  I: "bg-neutral-500",
};

export default function OfficialAvatar({
  name,
  party,
  size = 40,
  showParty = true,
}: AvatarProps) {
  const initials = getInitials(name);

  return (
    <div
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      <div
        className="w-full h-full rounded-full bg-neutral-200 flex items-center justify-center"
        style={{ fontSize: size * 0.35 }}
      >
        <span className="text-neutral-500 font-medium select-none leading-none">
          {initials}
        </span>
      </div>

      {showParty && party && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 text-white font-bold rounded-full flex items-center justify-center ${partyColors[party]}`}
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
