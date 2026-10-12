import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function PlayerAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Avatar className={cn("size-8", className)}>
      {image && <AvatarImage src={image} alt={name} referrerPolicy="no-referrer" />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
