// D-69 step 1's landing tile is the kit's Tile since step 2 (ui/Tile.jsx, design audit B0-1). This module keeps Play's
// name for it, so Play's tiles and the tests that stand in for this module do not change. Flagged for cleanup: Play's
// tiles can import `Tile` from the kit once those tests stand in for the kit instead.
export { Tile as PlayTile, spokenName } from '../ui/Tile.jsx';
