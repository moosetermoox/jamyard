import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = join(__dirname, '..', 'games');

export async function loadGame(gameId) {
  const configPath = join(GAMES_DIR, gameId, 'config.json');

  let raw;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch (err) {
    throw new Error(`Game not found: no config.json at games/${gameId}/config.json`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in games/${gameId}/config.json: ${err.message}`);
  }

  validate(config, gameId);

  return config;
}

export function validate(config, gameId) {
  if (!config.name) {
    throw new Error(`Game "${gameId}" is missing required field: name`);
  }

  if (!config.phases || typeof config.phases !== 'object') {
    throw new Error(`Game "${gameId}" is missing required field: phases`);
  }

  const phaseNames = Object.keys(config.phases);

  if (phaseNames.length === 0) {
    throw new Error(`Game "${gameId}" has no phases defined`);
  }

  const hasLobby = phaseNames.some(name => config.phases[name].type === 'lobby');
  if (!hasLobby) {
    throw new Error(`Game "${gameId}" is missing a lobby phase`);
  }

  const hasEnd = phaseNames.some(name => config.phases[name].type === 'end');
  if (!hasEnd) {
    throw new Error(`Game "${gameId}" is missing an end phase`);
  }

  for (const [name, phase] of Object.entries(config.phases)) {
    if (phase.next && !config.phases[phase.next]) {
      throw new Error(
        `Game "${gameId}": phase "${name}" has next "${phase.next}" which does not exist`
      );
    }

    if (phase.approveNext && !config.phases[phase.approveNext]) {
      throw new Error(
        `Game "${gameId}": phase "${name}" has approveNext "${phase.approveNext}" which does not exist`
      );
    }

    if (phase.rejectNext && !config.phases[phase.rejectNext]) {
      throw new Error(
        `Game "${gameId}": phase "${name}" has rejectNext "${phase.rejectNext}" which does not exist`
      );
    }
  }
}
