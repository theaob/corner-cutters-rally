import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';

/** the backend's calls, answered by `answer` (undefined: it didn't go) */
const calls: { name: string; args: Record<string, unknown> }[] = [];
let answer: (name: string, args: Record<string, unknown>) => unknown = () => null;
vi.mock('../src/engine/backend', () => ({
  online: () => true,
  rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return answer(name, args);
  },
}));

const { DAILY_GHOST_HZ, DAILY_GHOST_MAX_S, fetchDailyGhost, packGhost, pendingLaps, queueLap, sendLaps } = await import('../src/f1/boards');
const { ghostPose, parseGhost, GHOST_HZ } = await import('../src/f1/timeTrial');
const { loadDaily, logRun, saveDaily, sendPending } = await import('../src/f1/daily');

/** a ghost `seconds` long at `hz`, driving along x at 100 px/s */
const ghostOf = (seconds: number, hz = GHOST_HZ) => {
  const frames: number[] = [];
  for (let k = 0; k <= seconds * hz; k++) frames.push(100 * (k / hz) + 0.37, 50.44, 1.23456, k);
  return { time: seconds, splits: [], frames };
};

describe('the online boards', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
    calls.length = 0;
    answer = () => null;
  });

  it('a Time Trial record waits to be sent: the quicker one, per circuit and weather; none for a changeable weather', () => {
    queueLap({ circuit: 'baku', weather: 'dry', time: 81.2 });
    queueLap({ circuit: 'baku', weather: 'dry', time: 82 });
    queueLap({ circuit: 'baku', weather: 'wet', time: 95 });
    queueLap({ circuit: 'baku', weather: 'changeable' as never, time: 70 });
    expect(pendingLaps()).toEqual([{ circuit: 'baku', weather: 'dry', time: 81.2 }, { circuit: 'baku', weather: 'wet', time: 95 }]);
    queueLap({ circuit: 'baku', weather: 'dry', time: 80.5 });
    expect(pendingLaps()[0].time).toBe(80.5);
  });

  it('sent with your initials; one that didn\'t go stays for next time', async () => {
    queueLap({ circuit: 'baku', weather: 'dry', time: 81.2 });
    queueLap({ circuit: 'suzuka', weather: 'dry', time: 99 });
    answer = (_, a) => (a.p_circuit === 'suzuka' ? undefined : null);
    expect(await sendLaps('p', 'ABC', '1.0')).toBe(1);
    expect(calls[0]).toEqual({ name: 'submit_lap', args: { p_circuit: 'baku', p_weather: 'dry', p_player: 'p', p_name: 'ABC', p_time: 81.2, p_version: '1.0' } });
    expect(pendingLaps().map((l) => l.circuit)).toEqual(['suzuka']);
    answer = () => null;
    expect(await sendLaps('p', 'ABC')).toBe(1);
    expect(pendingLaps()).toEqual([]);
  });

  it("a Daily Challenge run's ghost, made small to send: 10 frames a second, to the px and the hundredth", () => {
    const packed = packGhost(ghostOf(30), GHOST_HZ)!;
    expect(packed.hz).toBe(DAILY_GHOST_HZ);
    expect(packed.frames.length / 4).toBe(30 * DAILY_GHOST_HZ + 1);
    expect(packed.frames.slice(0, 4)).toEqual([0, 50, 1.23, 0]);
    // (it still drives the same: 12.5 s in, 1,250 px along)
    expect(ghostPose(packed, 12.5)!.x).toBeCloseTo(1250, -1);
    expect(parseGhost(JSON.parse(JSON.stringify(packed)))).toEqual(packed);
    // (too long to send; too short to be one)
    expect(packGhost(ghostOf(DAILY_GHOST_MAX_S + 1), GHOST_HZ)).toBeUndefined();
    expect(packGhost(ghostOf(0.1), GHOST_HZ)).toBeUndefined();
  });

  it("a ghost's frame rate: its own when it says one, the Time Trial's when it doesn't; a nonsense one isn't a ghost", () => {
    const slow = { ...ghostOf(4, 5), hz: 5 };
    expect(ghostPose(slow, 2)!.x).toBeCloseTo(200.37, 1);
    expect(ghostPose(ghostOf(4), 2)!.x).toBeCloseTo(200.37, 1);
    expect(parseGhost({ ...slow, hz: -1 })).toBeUndefined();
    expect(parseGhost({ ...slow, hz: 'x' })).toBeUndefined();
  });

  it("the Daily Challenge's best run goes with its ghost (without it, for a backend that won't take one)", async () => {
    const log = loadDaily();
    const ghost = packGhost(ghostOf(30), GHOST_HZ)!;
    expect(logRun(log, '2026-10-05', { score: 12, time: 28.5 }, ghost)).toBe(true);
    saveDaily(log);
    // (kept on the device with it till it's sent)
    expect(loadDaily().pending?.ghost).toEqual(ghost);
    answer = (_, a) => (a.p_ghost ? undefined : null);
    expect(await sendPending(loadDaily(), 'p', 'ABC')).toBe(true);
    expect(calls.map((c) => Object.keys(c.args).includes('p_ghost'))).toEqual([true, false]);
    expect(loadDaily().pending).toBeUndefined();
  });

  it("the day's leading run to chase: its initials, how far, and a sound ghost (none if there isn't one)", async () => {
    const ghost = packGhost(ghostOf(30), GHOST_HZ)!;
    answer = () => ({ name: 'ZED', score: 40, time: 120.5, ghost });
    expect(await fetchDailyGhost('2026-10-05')).toEqual({ name: 'ZED', score: 40, time: 120.5, ghost });
    answer = () => null;
    expect(await fetchDailyGhost('2026-10-05')).toBeUndefined();
    answer = () => ({ name: 'ZED', score: 40, time: 120.5, ghost: { frames: 'x' } });
    expect(await fetchDailyGhost('2026-10-05')).toBeUndefined();
  });
});
