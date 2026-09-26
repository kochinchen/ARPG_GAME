import { NavGrid } from '../../src/game/movement/NavGrid';

export const navFrom = (...rows: string[]) => NavGrid.fromMap({ id: 'map.test', rows });
