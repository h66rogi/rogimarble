import { notFound } from 'next/navigation';
import board from '../../../../../presets/streamer-board.json';
import type { BoardDefinition } from '../../../lib/types';
import { isOverlayPartId } from '@/domains/marble/overlay-parts';
import { Overlay } from '../view';

export default async function OverlayPartPage({ params }: { params: Promise<{ widget: string }> }) {
  const { widget } = await params;
  if (!isOverlayPartId(widget)) notFound();
  return <Overlay board={board as unknown as BoardDefinition} widgetId={widget} />;
}
