"use client";

import { useRef, useState } from "react";
import { PAWN_STYLE_IDS, type PawnAppearanceDto, type PawnStyleId } from "@rogimarble/contracts";
import { PAWN_ARTWORK_URL } from "@rogimarble/animation";
import { api, apiAssetUrl, ApiError } from "../../../../lib/api";
import { ConsolePanel } from "@/shared/components/common/console-ui";
import { Input } from "@/shared/components/ui/input";
import { ConsoleAvatar } from "@/shared/components/common/console-avatar";
import { Button } from "@/shared/components/ui/button";
import { SelectionButton } from "@/shared/components/ui/selection-button";

const STYLE_NAMES: Record<PawnStyleId, string> = {
  "star-medal": "별 메달",
  "heart-chip": "하트 칩",
  "bunny-face": "토끼 얼굴",
};

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
  const reportError = async (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) {
      try {
        onChange(await api.currentPawnAppearance());
        setMessage("말 설정이 다른 화면에서 변경됐습니다. 다시 선택해 주세요.");
        return;
      } catch { /* Show the original save error below. */ }
    }
    setMessage(error instanceof Error ? error.message : "말 설정을 저장하지 못했습니다.");
  };
  const selectStyle = async (styleId: PawnStyleId) => {
    if (styleId === appearance.styleId && !appearance.image) return;
    setBusy(true);
    setMessage("");
    try {
      onChange(await api.selectPawnStyle(styleId, appearance.revision));
      setMessage(`${PAWN_STYLE_IDS.indexOf(styleId) + 1}번 ${STYLE_NAMES[styleId]} 말을 적용했습니다.`);
    } catch (error) {
      await reportError(error);
    } finally {
      setBusy(false);
    }
  };
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
      await reportError(error);
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
      await reportError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConsolePanel
      title="말 디자인"
      description="기본 말은 1번 별 메달입니다. 선택하면 방송 화면에도 바로 반영됩니다."
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)]">
        <section className="min-w-0 space-y-3" aria-label="기본 말 스타일">
          <h3 className="text-base font-semibold">기본 말 스타일</h3>
          <div className="grid grid-cols-3 gap-2">
            {PAWN_STYLE_IDS.map((styleId, index) => (
              <SelectionButton
                key={styleId}
                layout="tile"
                selected={!appearance.image && appearance.styleId === styleId}
                disabled={disabled || busy}
                onClick={() => void selectStyle(styleId)}
              >
                <img src={PAWN_ARTWORK_URL[styleId]} alt="" className="h-16 w-16 object-contain" />
                <span>{index + 1}. {STYLE_NAMES[styleId]}</span>
              </SelectionButton>
            ))}
          </div>
        </section>
        <section className="min-w-0 space-y-4 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6" aria-label="사진 말 설정">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">사진 말</h3>
            <p className="text-sm text-muted-foreground">얼굴이 잘 보이는 정사각형 이미지를 올려 주세요.</p>
          </div>
          {appearance.image && <ConsoleAvatar src={apiAssetUrl(appearance.image.url)} />}
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
          <div className="flex flex-wrap gap-2">
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
        </section>
      </div>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </ConsolePanel>
  );
}
