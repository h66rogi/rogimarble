import board from '../../../presets/streamer-board.json';
import { Console } from './console';
import type { BoardDefinition } from '../lib/types';

export default function Page() { return <Console board={board as unknown as BoardDefinition} />; }
