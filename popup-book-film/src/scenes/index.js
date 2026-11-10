// Scene registry: one factory per spread, in SPREADS order.
import { createScene as forest } from './forest.js';
import { createScene as village } from './village.js';
import { createScene as sea } from './sea.js';
import { createScene as mountain } from './mountain.js';
import { createScene as night } from './night.js';

export const sceneFactories = [forest, village, sea, mountain, night];
