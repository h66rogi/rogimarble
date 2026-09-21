"use client";

import { useRef, useState } from "react";
import type { PawnAppearanceDto } from "@rogimarble/contracts";
import { api, apiAssetUrl } from "../../../../lib/api";
import { ConsolePanel } from "@/shared/components/common/console-ui";
import { Input } from "@/shared/components/ui/input";
import { ConsoleAvatar } from "@/shared/components/common/console-avatar";
import { Button } from "@/shared/components/ui/button";

export function PawnImageControl({
  appearance,
  disabled,
  onChange,
}: {
  appearance: PawnAppearanceDto;
  disabled: boolean;
  onChange: (value: PawnAppearanceDto) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const upload = async (file: File) => {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setMessage("PNG, JPEG, WebP 파일을 5MB 이하로 선택하세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      onChange(await api.uploadPawnImage(file, appearance.revision));
      setMessage("사진 말을 저장했습니다. 방송 화면에도 바로 반영됩니다.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "사진 말을 저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const remove = async () => {
    setBusy(true);
    setMessage("");
    try {
      onChange(await api.removePawnImage(appearance.revision));
      setMessage("기본 말로 되돌렸습니다.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "사진 말을 삭제하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConsolePanel
      title="사진 말"
      description="얼굴이 잘 보이는 정사각형 사진을 권장합니다."
    >
      <ConsoleAvatar
        src={appearance.image ? apiAssetUrl(appearance.image.url) : undefined}
      />
      <Input
        ref={input}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          type="button"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          {appearance.image ? "사진 바꾸기" : "사진 올리기"}
        </Button>
        {appearance.image && (
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => void remove()}
          >
            기본 말로
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </ConsolePanel>
  );
}
