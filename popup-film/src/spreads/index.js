/**
 * spreads/index.js — the four spread modules in film order (spread k = SPREAD_MODULES[k - 1]).
 */
import forest from './forest.js';
import sea from './sea.js';
import city from './city.js';
import sky from './sky.js';

export const SPREAD_MODULES = [forest, sea, city, sky];
