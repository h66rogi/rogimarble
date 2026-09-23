"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

function MaskedUrlInput({ label, value }: { label: string; value: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        readOnly
        aria-label={label}
        value={value}
        className={cn(
          "font-mono text-xs transition-[filter] duration-200",
          !revealed && "blur-[6px] select-none",
        )}
        onFocus={(event) => {
          if (revealed) event.target.select();
        }}
      />
      {!revealed && (
        <button
          type="button"
          aria-label={`${label} 표시`}
          className="absolute inset-0 flex w-full cursor-pointer items-center justify-center gap-1.5"
          onClick={() => setRevealed(true)}
        >
          <Eye className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            클릭하여 URL 표시
          </span>
        </button>
      )}
    </div>
  );
}

export { MaskedUrlInput };
