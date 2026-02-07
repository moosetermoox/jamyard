// Shared event bus for internal engine communication
// Modules emit and listen to events here instead of calling each other directly

import { EventEmitter } from 'events';

export const eventBus = new EventEmitter();
