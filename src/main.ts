// The page's entry: the host got ready first (in the YouTube build, the player's
// save loaded from YouTube, so the game starts on it: engine/host.ts), then the
// game itself (app.ts).

import { prepareHost } from './engine/host';

void prepareHost().then(() => import('./app'));
