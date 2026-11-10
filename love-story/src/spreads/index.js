/**
 * spreads/index.js — the six spread modules in film order (spread k = SPREAD_MODULES[k - 1];
 * ids and titles match timeline.js SPREADS).
 */
import walmart from './walmart.js';
import dates from './dates.js';
import official from './official.js';
import life from './life.js';
import proposal from './proposal.js';
import wedding from './wedding.js';

export const SPREAD_MODULES = [walmart, dates, official, life, proposal, wedding];
