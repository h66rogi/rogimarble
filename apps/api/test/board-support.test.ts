import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { BoardDefinition } from '../../../packages/game-core/src/board-definition.ts';
import { isBoardSupportedForLive, unsupportedBoardEffects } from '../src/board-support.ts';

test('the initial board is supported with operator-selectable next-turn travel', async () => {
  const board = JSON.parse(await readFile(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8')) as BoardDefinition;
  assert.deepEqual(unsupportedBoardEffects(board), []);
  assert.equal(isBoardSupportedForLive(board), true);
});

test('the implemented arrival-effect subset is accepted without names or indices', async () => {
  const source = JSON.parse(await readFile(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8')) as BoardDefinition;
  const board = { ...source, cells: source.cells.map((cell) => ({ ...cell,
    onLand: cell.onLand.filter((effect) => effect.type !== 'choose_destination') })) } satisfies BoardDefinition;
  assert.deepEqual(unsupportedBoardEffects(board), []);
  assert.equal(isBoardSupportedForLive(board), true);
});

test('choice missions and unsupported roll modifiers fail closed', async () => {
  const source = JSON.parse(await readFile(new URL('../../../presets/streamer-board.json', import.meta.url), 'utf8')) as BoardDefinition;
  const choice = { ...source, cells: source.cells.map((cell, index) => index ? cell : { ...cell, onLand: [{ type:'choice_mission', prompt:'choose', selection:'operator', choices:[{id:'a',label:'A',message:'A'},{id:'b',label:'B',message:'B'}] }] }) } as BoardDefinition;
  assert.deepEqual(unsupportedBoardEffects(choice), ['choice_mission']);
  const diceCount = { ...source, cells: source.cells.map((cell, index) => index ? cell : { ...cell, onLand: [{ type:'modify_roll', uses:1, modifier:{type:'dice_count',count:2} }] }) } as BoardDefinition;
  assert.deepEqual(unsupportedBoardEffects(diceCount), ['modify_roll']);
});
