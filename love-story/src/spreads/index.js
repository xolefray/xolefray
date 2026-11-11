/**
 * spreads/index.js — the spread modules in film order (spread k = SPREAD_MODULES[k - 1];
 * ids and titles match timeline.js SPREADS). Eight spreads in version 2.
 */
import walmart from './walmart.js';
import lunch from './lunch.js';
import dates from './dates.js';
import fate from './fate.js';
import official from './official.js';
import life from './life.js';
import proposal from './proposal.js';
import wedding from './wedding.js';

export const SPREAD_MODULES = [walmart, lunch, dates, fate, official, life, proposal, wedding];
