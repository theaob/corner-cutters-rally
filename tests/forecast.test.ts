import { describe, expect, it } from 'vitest';
import { FORECAST, changeableForecast, conditionOf, fixedForecast, rainAt, roundForecast, startWeather, stepWeather, weatherAhead, type Forecast } from '../src/f1/forecast';
import { fitAt, tyreFor, wrongTyreLoss } from '../src/f1/tyres';
import { lookAt } from '../src/f1/weather';

const run = (f: Forecast, until: number) => {
  const s = startWeather(f);
  for (let t = 0; t < until; t += 0.1) stepWeather(s, f, t, 0.1);
  return s;
};

describe('the forecast', () => {
  it('keeps a fixed weather the same all race', () => {
    for (const w of ['dry', 'damp', 'wet'] as const) {
      const s = run(fixedForecast(w), 300);
      expect(conditionOf(s.wetness)).toBe(w);
      expect(s.rain).toBe(w === 'wet' ? 1 : 0);
    }
  });

  it('wets the track in a shower, harder the harder it rains, and dries it slowly after', () => {
    const shower: Forecast = { name: 'SHOWERS', start: 0, showers: [{ from: 10, to: 70, rain: 1 }] };
    expect(rainAt(shower, 5)).toBe(0);
    expect(rainAt(shower, 10 + FORECAST.fade / 2)).toBeCloseTo(0.5);
    expect(rainAt(shower, 40)).toBe(1);
    const wet = run(shower, 70);
    expect(conditionOf(wet.wetness)).toBe('wet');
    // (light rain only dampens it)
    expect(conditionOf(run({ name: 'LIGHT RAIN', start: 0, showers: [{ from: 0, to: Infinity, rain: 0.5 }] }, 200).wetness)).toBe('damp');
    // drying takes longer than wetting
    const after = run(shower, 70 + 30);
    expect(after.rain).toBe(0);
    expect(after.wetness).toBeLessThan(wet.wetness);
    expect(after.wetness).toBeGreaterThan(1);
    expect(conditionOf(run(shower, 70 + 120).wetness)).toBe('dry');
  });

  it('looks ahead without changing the weather now', () => {
    const f: Forecast = { name: 'RAIN', start: 0, showers: [{ from: 10, to: Infinity, rain: 1 }] };
    const now = startWeather(f);
    const ahead = weatherAhead(now, f, 0, 40);
    expect(now.wetness).toBe(0);
    expect(ahead.wetness).toBeGreaterThan(1.5);
  });

  it('draws changeable forecasts from the seed: the same seed, the same weather', () => {
    expect(changeableForecast(7, 300)).toEqual(changeableForecast(7, 300));
    const names = new Set(Array.from({ length: 60 }, (_, k) => changeableForecast(k + 1, 300).name));
    expect([...names].sort()).toEqual(['DRYING', 'LIGHT RAIN', 'SHOWERS']);
    // (its name doesn't hang on the race's length: the Championship screen names it without one)
    for (let k = 1; k < 30; k++) expect(changeableForecast(k, 1).name).toBe(changeableForecast(k, 400).name);
  });

  it('gives Championship rounds mostly dry weather, now and then wet or changeable', () => {
    const rounds = Array.from({ length: 400 }, (_, k) => roundForecast(k + 1, 300));
    const share = (p: (f: Forecast) => boolean) => rounds.filter(p).length / rounds.length;
    expect(share((f) => f.fixed === true && f.start === 0)).toBeGreaterThan(0.4);
    expect(share((f) => !f.fixed)).toBeGreaterThan(0.15);
    expect(share((f) => f.fixed === true && f.start === 2)).toBeGreaterThan(0.04);
  });
});

describe('tyres between the weathers', () => {
  it('cross over from slicks to intermediates to full wets as the track wets', () => {
    expect(tyreFor(0)).toBe('slick');
    expect(tyreFor(0.3)).toBe('slick');
    expect(tyreFor(1)).toBe('inter');
    expect(tyreFor(1.4)).toBe('inter');
    expect(tyreFor(1.8)).toBe('wet');
    expect(fitAt('slick', 0.5).grip).toBeCloseTo((fitAt('slick', 0).grip + fitAt('slick', 1).grip) / 2);
  });

  it('cost grip on the wrong compound, more the wronger', () => {
    expect(wrongTyreLoss('slick', 0)).toBe(0);
    expect(wrongTyreLoss('slick', 2)).toBeGreaterThan(wrongTyreLoss('inter', 2));
    expect(wrongTyreLoss('inter', 2)).toBeGreaterThan(0);
  });
});

describe('the weather look', () => {
  it('greys the sky in the rain and darkens a wet track', () => {
    const dry = lookAt(0, 0);
    const wet = lookAt(2, 1);
    expect(dry.spray).toBe(false);
    expect(wet.spray).toBe(true);
    expect(wet.sky.keyIntensity).toBeLessThan(dry.sky.keyIntensity);
    expect(wet.groundTint & 255).toBeLessThan(dry.groundTint & 255);
  });
});
