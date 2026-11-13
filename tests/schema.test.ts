// supabase/schema.sql is applied by hand, so nothing else notices when it falls behind the game. A platform the game
// reports that the table's check doesn't allow takes no events.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/stats/schemaVersion';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

describe('supabase/schema.sql', () => {
  it('lets every platform the game reports through (web, android, ios), on events and reports', () => {
    expect(schema.match(/platform in \('web', 'android', 'ios'\)/g)?.length).toBe(4);
    expect(schema).not.toMatch(/platform in \('web', 'android'\)/);
  });
  it('stamps the version the dashboard expects', () => {
    expect(schema).toContain(`create or replace function public.schema_version() returns int\nlanguage sql immutable as $$ select ${SCHEMA_VERSION} $$;`);
  });
  it('keeps every grant the published builds use, and gives signed-in users nothing', () => {
    // (the functions and tables a build already on a phone calls or adds to)
    for (const f of ['submit_daily', 'daily_ghost', 'daily_board', 'submit_lap', 'lap_board', 'reports_list', 'errors_list', 'errors_clear', 'reports_delete', 'game_stats', 'retention_stats']) {
      expect(schema, f).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to anon;`));
    }
    expect(schema).toContain('grant insert on public.events to anon;');
    expect(schema).toContain('grant insert on public.reports to anon;');
    expect(schema).toContain('revoke all on function public.set_reports_code(text) from public, anon, authenticated;');
    expect(schema).toContain('revoke all on all functions in schema public from authenticated;');
  });
  it('lets a report picture through only as a JPEG data URL', () => {
    expect(schema).toContain("not like 'data:image/jpeg;base64,%'");
  });
});
