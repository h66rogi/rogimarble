import board from '../../../../presets/streamer-board.json';
import { Overlay } from './view';
import type { BoardDefinition } from '../../lib/types';

export default function OverlayPage() { return <Overlay board={board as unknown as BoardDefinition} />; }
