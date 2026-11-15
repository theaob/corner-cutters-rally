// The page's entry: the host got ready first (in the YouTube build, the player's
// save loaded from YouTube, so the game starts on it: engine/host.ts), then the
// save and the chosen language's words (f1/boot.ts), then the game itself (app.ts).

import './styles/game.css';
import { prepareHost } from './engine/host';
import { prepareGame } from './f1/boot';

void prepareHost().then(prepareGame).then(() => import('./app'));
