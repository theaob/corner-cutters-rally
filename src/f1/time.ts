// Times as the screens show them.

/** A time as m:ss.hh ('–' for none). */
export const formatTime = (s?: number) => (s === undefined ? '–' : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`);
