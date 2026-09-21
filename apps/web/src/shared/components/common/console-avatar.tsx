import { UserRound } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/components/ui/avatar";

export function ConsoleAvatar({ src }: { src?: string }) {
  return (
    <Avatar>
      <AvatarImage src={src} alt="현재 사진 말" />
      <AvatarFallback>
        <UserRound aria-label="기본 말" />
      </AvatarFallback>
    </Avatar>
  );
}
