// What you're asking the car for, from whatever you drive with: the wheel (−1 full left … 1 full right), the gas and
// the brake (0…1), and the handbrake. Engine-free.

export interface Intent {
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
}

export const IDLE: Intent = { steer: 0, throttle: 0, brake: 0, handbrake: false };

/** Whether `i` asks for anything at all. */
export const active = (i: Intent | undefined): boolean => !!i && (i.steer !== 0 || i.throttle > 0 || i.brake > 0 || i.handbrake);
