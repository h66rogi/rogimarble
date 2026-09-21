"use client";

import { Construction } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";

export function AlertboxComingSoon() {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Construction className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">알림창 준비중입니다</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          후원/팔로우 알림창 기능은 현재 개발 중입니다.
          <br />
          빠른 시일 내에 만나보실 수 있습니다!
        </p>
      </CardContent>
    </Card>
  );
}
