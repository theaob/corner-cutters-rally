// The circuits. Each is a centreline (control points in racing order, the
// first on the start/finish line), a scale, and an elevation profile along the
// lap; circuit.ts turns one into tiles, run-off, heights and a starting grid.

import type { PitSpec } from './pits';
import type { Pt } from './racing';

export interface CircuitLayout {
  id: string;
  name: string;
  /** a line about it, for the menu */
  about: string;
  /** centreline control points (px, before scaling), in racing order; the first is on the start/finish line */
  points: Pt[];
  /** px per unit of `points` */
  scale: number;
  /** elevation (px) along the lap, as [share of the lap, height]; the first and last heights match */
  elevation: [number, number][];
  /** the pit lane, beside the main straight */
  pit: PitSpec;
  /** how hard it is on tyres (1 unless given) */
  tyreWear?: number;
  /** a street circuit: walls `runoff` px off the track's edge (pavement between), the town all round, the sea (a polygon, in `points` units), and any tunnel (px along the lap, from and to) */
  street?: StreetSpec;
  /** a banked bend: px along the lap (from, to), and how steeply the track tilts up toward the outside (rise per px across, at its steepest) */
  banking?: { from: number; to: number; grade: number };
  /** in a forest: trees packed all round beyond the barriers, on a dark forest floor */
  forest?: boolean;
  /** in a park: groves of trees here and there over the grass, and lining the lap from `avenue[0]` to `avenue[1]` px round it (its woods) */
  park?: { avenue: [number, number] };
  /** in the desert: sand all round, beyond the barriers and on the run-off */
  desert?: boolean;
  /** lakes beyond the barriers: polygons (in `points` units), their water flat in the hollows of the ground */
  lakes?: Pt[][];
  /** the track crosses itself on a bridge: px along the lap where the stretch on the bridge (`over`) and the one
   * underneath (`under`) cross, the deck `height` px up there (the elevation profile has both at the same height) */
  bridge?: { over: number; under: number; height: number };
  /**
   * jumps: at `at` px along the lap, a crest with a sharp lip the cars fly off (the ground rising `rise` px up a
   * run-up to it, and falling away beyond to land on: circuit.ts's JUMP); each on a straight, as no car steers in the air
   */
  jumps?: { at: number; rise: number }[];
  /** the cherry trees in blossom: groves of them round the circuit and lining the lap, their petals drifting onto the track (petals.ts) */
  blossoms?: boolean;
  /** a gopher now and then popping up out of its hole by the track near the camera and scurrying across (gopher.ts) */
  gophers?: boolean;
  /** under snow (a winter's circuit in the mountains): snow over the run-off and beyond, the spruces laden with it */
  snow?: boolean;
  /** a yeti, now and then lying in wait beside the track up the road, and chasing the car that comes by (yeti.ts) */
  yeti?: boolean;
  /** an aerial tramway (tramway.ts): its two stations (px, as the circuit's laid out): on the valley floor, and up the mountain */
  tramway?: { from: [number, number]; to: [number, number] };
  /** the crowd on its feet in the grandstands, on steps in front of each, cheering the cars by (crowd3d.ts) */
  crowds?: boolean;
  /** monster trucks jumping a pile of wrecks in the infield (monsterTrucks.ts): their arena's middle (px, as the circuit's laid out) and the way its lanes run (radians) */
  monsterTrucks?: { at: [number, number]; angle: number };
  /** on dirt: the track's surface loose earth, every car on off-road tyres (tyres.ts), sliding through the bends */
  dirt?: boolean;
  /** free: open to everyone from the start (the Google Play build without the Championship too), and not a round of the Championship */
  free?: boolean;
  /** in the mountains: rock and alpine meadow beyond the barriers, snow up high, pines below the tree line and boulders */
  mountain?: boolean;
  /** the podium hangs over the main straight on a deck from the pit side, this many px up (else it stands on the run-off) */
  podiumDeck?: number;
  /** a word painted across the garages' roofs, a few letters on each, read from the camera (AZERBAIJAN) */
  pitRoof?: string;
}

export interface StreetSpec {
  runoff: number;
  sea: Pt[];
  tunnel?: [number, number];
  /** where its landmarks stand (in `points` units): any of the casino, an open-air swimming pool, a tennis court (Harbour), the Maiden Tower and the Flame Towers (Baku) */
  landmarks?: Partial<Record<LandmarkKind, Pt>>;
  /** old city walls (Baku's): along the lap from `from` to `to` (shares of it), just behind the barriers on its `side` (+1: the right, going round), with round towers along them and a gate tower */
  castle?: { from: number; to: number; side: 1 | -1 };
}

/** The landmarks a street circuit can have (town3d.ts builds them). */
export type LandmarkKind = 'casino' | 'pool' | 'tennis' | 'maiden' | 'flames' | 'crescent';

/**
 * Crescent Park. Anticlockwise over the hills, after the one on the edge of the
 * big city between two continents (outline data from the same source as Silver
 * Heath's, its main straight eased straight for the pit lane and its tight
 * bends opened out a little): the plunging downhill left of Turn 1 and the
 * right of Turn 2 at the bottom, the climb through the fast Turns 3 to 6 to the
 * hairpin, round onto the long climb to the famous Turn 8, the four-apex left
 * on the hillside at the top, the Turns 9 and 10 esses down off it, the long
 * back straight with its kink, the heavy stop at Turn 12, and the Turns 13 and
 * 14 up onto the main straight. A lap is about 7900 px, about 24 s.
 */
export const CRESCENT_PARK: CircuitLayout = {
  id: 'crescent-park',
  name: 'Crescent Park',
  about: 'anticlockwise · over the hills, the long Turn 8',
  points: ([
    [505, 1186], [532, 1180], [559, 1174], [587, 1168], [614, 1162], [641, 1156],
    [669, 1150], [696, 1144], [723, 1137], [744, 1118], [752, 1092], [748, 1064],
    [743, 1037], [737, 1009], [735, 982], [742, 955], [756, 931], [774, 909],
    [794, 890], [818, 876], [843, 862], [867, 849], [894, 839], [920, 830],
    [946, 820], [974, 814], [1001, 809], [1029, 804], [1056, 802], [1084, 803],
    [1112, 803], [1140, 804], [1168, 804], [1196, 799], [1221, 788], [1238, 767],
    [1247, 740], [1251, 712], [1249, 684], [1254, 657], [1273, 637], [1300, 629],
    [1328, 631], [1355, 628], [1378, 613], [1390, 588], [1389, 560], [1382, 533],
    [1364, 512], [1340, 498], [1315, 486], [1290, 473], [1265, 460], [1240, 448],
    [1215, 435], [1190, 423], [1165, 410], [1140, 397], [1115, 385], [1090, 372],
    [1065, 359], [1040, 347], [1015, 334], [991, 319], [978, 295], [979, 268],
    [994, 245], [1019, 231], [1046, 225], [1073, 229], [1101, 233], [1129, 237],
    [1157, 241], [1184, 246], [1211, 253], [1238, 260], [1266, 266], [1293, 273],
    [1320, 279], [1347, 276], [1373, 264], [1397, 251], [1420, 235], [1431, 209],
    [1440, 183], [1448, 156], [1448, 128], [1435, 103], [1422, 79], [1403, 58],
    [1383, 38], [1364, 18], [1339, 6], [1312, 0], [1284, 3], [1257, 10],
    [1230, 18], [1203, 26], [1176, 33], [1149, 41], [1123, 49], [1096, 57],
    [1069, 65], [1042, 73], [1015, 81], [988, 89], [962, 97], [935, 105],
    [908, 113], [881, 121], [854, 129], [827, 136], [802, 149], [787, 171],
    [786, 199], [797, 224], [804, 251], [798, 278], [789, 305], [780, 331],
    [772, 358], [763, 384], [754, 411], [746, 438], [738, 464], [729, 491],
    [720, 518], [711, 544], [703, 571], [694, 597], [685, 624], [677, 651],
    [668, 677], [659, 704], [647, 729], [628, 749], [607, 768], [583, 782],
    [558, 795], [534, 809], [509, 822], [485, 836], [460, 849], [436, 863],
    [411, 876], [386, 889], [362, 903], [337, 916], [313, 930], [288, 943],
    [264, 957], [239, 970], [215, 984], [190, 997], [165, 1011], [141, 1024],
    [116, 1038], [92, 1051], [67, 1065], [43, 1078], [18, 1092], [0, 1112],
    [4, 1138], [28, 1151], [56, 1156], [73, 1176], [71, 1204], [68, 1232],
    [74, 1258], [99, 1270], [126, 1265], [154, 1260], [181, 1255], [209, 1249],
    [236, 1243], [264, 1238], [291, 1232], [318, 1226], [346, 1220], [373, 1214],
    [400, 1208], [428, 1202], [455, 1196], [482, 1190],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 2.0,
  // (a share of the lap): the plunge into Turn 1, down to Turn 2, the climb through the fast bends to the hairpin,
  // up to Turn 8 high on the hill, down the esses and the back straight, and the climb from Turn 12 to the line
  elevation: [
    [0, 30],
    [0.06, 26],
    [0.12, 6],
    [0.18, 4],
    [0.26, 18],
    [0.34, 26],
    [0.4, 22],
    [0.5, 32],
    [0.58, 22],
    [0.66, 10],
    [0.76, 16],
    [0.88, 30],
    [0.94, 28],
    [1, 30],
  ],
  // on the infield side of the main straight
  pit: { from: -690, to: 370, side: -1 },
  // (a 30 s lap: no harder on tyres than a race of five laps of 24 s was)
  tyreWear: 0.7,
};

/**
 * Silver Heath. Clockwise and fast, traced from a circuit outline (in metres,
 * eased a little so the bends suit the arcade handling; outline data from
 * github.com/bacinger/f1-circuits, MIT): from the start straight, a fast right
 * and a left kink, a tight right–hairpin–left hook, a long straight, a left and
 * a long right, a fast right onto the old straight, a flat-out right, a run of
 * esses onto the longest straight, a fast right, and a tight left–right complex
 * back onto the start straight. The hook's hairpin and the last complex are the
 * two places to lift. A lap is about 8800 px, about 27 s.
 */
export const SILVER_HEATH: CircuitLayout = {
  id: 'silver-heath',
  name: 'Silver Heath',
  about: 'clockwise · fast, two hard stops',
  points: ([
    [451, 636], [487, 589], [524, 542], [564, 499], [611, 470], [666, 460],
    [725, 462], [783, 460], [838, 444], [889, 415], [937, 380], [984, 352],
    [1026, 351], [1059, 381], [1088, 410], [1118, 403], [1140, 361], [1146, 306],
    [1130, 255], [1094, 210], [1051, 169], [1007, 129], [963, 88], [918, 48],
    [874, 8], [829, -33], [785, -73], [740, -113], [694, -149], [645, -171],
    [600, -164], [568, -128], [543, -84], [510, -62], [478, -78], [472, -122],
    [489, -175], [518, -227], [553, -274], [597, -312], [649, -338], [706, -352],
    [766, -360], [825, -366], [885, -371], [945, -376], [1005, -381], [1063, -381],
    [1117, -367], [1159, -333], [1186, -284], [1203, -227], [1217, -169], [1226, -109],
    [1231, -50], [1235, 10], [1239, 70], [1249, 128], [1264, 184], [1271, 240],
    [1264, 297], [1258, 354], [1266, 409], [1282, 462], [1280, 513], [1252, 557],
    [1209, 596], [1169, 638], [1136, 687], [1107, 740], [1078, 792], [1049, 845],
    [1021, 898], [992, 950], [963, 1003], [927, 1051], [892, 1099], [856, 1147], [820, 1195], [785, 1244], [749, 1292], [713, 1340], [678, 1388], [642, 1436], [613, 1489], [582, 1541],
    [550, 1591], [515, 1638], [472, 1672], [422, 1681], [375, 1660], [339, 1617],
    [307, 1568], [272, 1520], [233, 1474], [193, 1431], [151, 1396], [106, 1382],
    [60, 1374], [22, 1344], [0, 1296], [2, 1243], [27, 1192], [61, 1144],
    [97, 1096], [134, 1049], [198, 966], [262, 882], [326, 798], [388, 717],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.6,
  // an old airfield, nearly flat: a gentle crest after the esses, rising along the longest straight, down through the last complex
  elevation: [
    [0, 10],
    [0.085, 12],
    [0.171, 6],
    [0.272, 4],
    [0.383, 10],
    [0.511, 22],
    [0.561, 18],
    [0.772, 26],
    [0.84, 14],
    [1, 10],
  ],
  // on the outside, along the start straight: out of the last complex's long right, back in before the fast right
  pit: { from: -880, to: 192, side: -1 },
  // (wear runs by the second: a set lasts the same three laps as on the shorter circuits)
  tyreWear: 0.85,
};

/**
 * Harbour. Clockwise through the streets of a harbour town, after the most
 * famous street circuit of all (its corners in order, eased apart so our wider
 * track fits between the walls; the outline after github.com/bacinger/f1-circuits,
 * MIT): the main straight beside the harbour, a tight right at the first
 * corner, the climb up the hill, a long left and a right flick across the
 * square at the top, down to a tight right, the slowest hairpin anywhere, two
 * rights to the sea front, the long right-curving tunnel, the chicane at its
 * exit, a fast left along the quay, the pool's left–right and right–left, the
 * tight right at the bottom and the last right onto the straight. Walls all
 * the way round, a step off the track.
 */
export const HARBOUR: CircuitLayout = {
  id: 'harbour',
  name: 'Harbour',
  about: 'clockwise · tight streets, walls close',
  points: ([
    // the main straight, north, the pits on the harbour side
    [500, 2000], [500, 1760],
    // the first corner: a right
    [512, 1620], [560, 1535], [650, 1480],
    // the climb up the hill, north-east
    [800, 1400], [1050, 1250], [1300, 1080], [1480, 950],
    // the long left
    [1580, 860], [1630, 760], [1645, 660],
    // the right flick across the square
    [1680, 590], [1760, 560],
    // down to the tight right
    [1900, 565], [2010, 600], [2060, 680],
    [2070, 800], [2060, 900],
    // the hairpin: left, round to heading back north
    [2080, 980], [2140, 1010], [2200, 990], [2225, 920],
    // two rights to the sea front
    [2240, 840], [2300, 790], [2380, 790],
    [2450, 830], [2490, 920],
    // the tunnel: a long right along the coast
    [2500, 1100], [2470, 1350], [2390, 1600], [2260, 1830], [2100, 2000],
    // the chicane: left, right
    [1990, 2090], [1960, 2160], [1900, 2210], [1820, 2220],
    // along the quay, then the fast left
    [1500, 2210], [1150, 2190], [1000, 2210], [930, 2290],
    // the pool: left–right, then right–left
    [905, 2450], [915, 2560], [935, 2650], [935, 2740],
    [915, 2830], [905, 2930], [905, 3030],
    // down to the tight right at the bottom, and the last right
    [905, 3250], [885, 3390], [830, 3470], [720, 3490],
    [610, 3480], [530, 3430], [505, 3330],
    // back up the straight
    [500, 3000], [500, 2600], [500, 2300],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1,
  // up from the harbour to the square at the top, down to the sea front, flat round the harbour
  elevation: [
    [0, 10],
    [0.05, 12],
    [0.16, 44],
    [0.23, 62],
    [0.28, 54],
    [0.33, 38],
    [0.39, 16],
    [0.5, 8],
    [0.6, 6],
    [0.9, 8],
    [1, 10],
  ],
  // on the harbour side of the straight
  pit: { from: -1000, to: 272, side: 1 },
  // slow streets, easy on tyres: track position is everything
  tyreWear: 0.3,
  street: {
    runoff: 28,
    // the harbour, beyond the quay and the pool, and the sea along the coast past the tunnel
    sea: ([
      [1000, 2300], [1750, 2300], [2150, 2130], [2420, 1820], [2580, 1300], [2620, 700],
      [3400, 700], [3400, 4200], [1000, 4200],
    ] as [number, number][]).map(([x, y]) => ({ x, y })),
    tunnel: [3500, 4500],
    // the casino above the hairpin, the pool at the foot of the pool section, the tennis court beside the climb: each
    // beside a stretch of track that runs across the screen, where the camera has room to show it
    landmarks: { casino: { x: 2240, y: 626 }, pool: { x: 756, y: 3220 }, tennis: { x: 846, y: 1584 } },
  },
};

/**
 * Royal Park. Clockwise through an old royal park, after the temple of speed
 * (its corners in order, eased for the arcade handling): the longest straight
 * of all, the first chicane (right–left), the long right of the big curve, the
 * second chicane (left–right), the two rights of the woods, the straight under
 * the trees, the fast left–right–left chicane, the back straight, and the
 * banking: a long right of a half circle, tilted up to the outside, flat out
 * onto the main straight. The podium hangs out over the main straight.
 */
export const ROYAL_PARK: CircuitLayout = {
  id: 'royal-park',
  name: 'Royal Park',
  about: 'clockwise · the banking, the longest straight',
  points: ([
    // the main straight, east, the pits on the outside (north)
    [1000, 300], [1500, 300], [2000, 300], [2440, 300],
    // the first chicane: a hard right, then left
    [2500, 304], [2530, 330], [2545, 370], [2565, 400], [2605, 414], [2680, 420], [2760, 430],
    // the big curve: a long right, round to heading south
    [2880, 475], [3000, 535], [3090, 625], [3140, 745], [3150, 875],
    // the second chicane: left, right
    [3150, 960], [3158, 990], [3185, 1010], [3208, 1035], [3215, 1075], [3200, 1125], [3180, 1170],
    // the woods: two rights, round to heading west
    [3150, 1225], [3100, 1275], [3030, 1305],
    [2960, 1340], [2900, 1380], [2820, 1390],
    // the straight under the trees
    [2500, 1380], [2150, 1340],
    // the fast chicane: left, right, left
    [2050, 1330], [1980, 1360], [1900, 1380], [1820, 1360], [1760, 1310], [1680, 1280],
    // the back straight, toward the main one
    [1400, 1200], [1100, 1080],
    // the banking: a half circle round to heading east
    [880, 990], [700, 940], [530, 900], [420, 800], [380, 650], [410, 490], [500, 370], [620, 310],
    // onto the main straight
    [800, 300],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.4,
  // a park: nearly flat, a little rise through the woods
  elevation: [
    [0, 8],
    [0.2, 10],
    [0.4, 18],
    [0.55, 14],
    [0.75, 6],
    [1, 8],
  ],
  pit: { from: -400, to: 1100, side: -1 },
  // (from the back straight's end round to the main straight)
  banking: { from: 7700, to: 9100, grade: 0.3 },
  podiumDeck: 46,
  // the old park's trees: groves over the lawns, and the woods, from their two rights along the straight under the
  // trees to the fast chicane
  park: { avenue: [3900, 5600] },
};

/**
 * Ardennes. Clockwise, up and down through a forest in the Ardennes, traced
 * from the most famous circuit in those hills (outline data from
 * github.com/bacinger/f1-circuits, MIT), and the longest lap of all: from the
 * line, the tight right of the hairpin, the plunge down past the pits to the
 * bottom of the valley, the left–right–left of the steepest climb anywhere,
 * the long climb of the straight to the top of the hill, the right–left
 * chicane and the right after it, the long right of the second hairpin, down
 * through the double-apex left, the right–left in the woods and the two
 * rights at the bottom of the valley, the long, flat-out climb back through
 * the left kinks, and the right–left of the last chicane onto the straight.
 */
export const ARDENNES: CircuitLayout = {
  id: 'ardennes',
  name: 'Ardennes',
  about: 'clockwise · the longest, up and down through the forest',
  points: ([
    [227, -50], [161, -162], [135, -215], [139, -249], [165, -263], [199, -249],
    [268, -202], [311, -175], [357, -142], [417, -74], [450, -39], [489, 16],
    [528, 70], [566, 125], [605, 180], [644, 235], [682, 290], [721, 344],
    [760, 399], [793, 424], [831, 448], [847, 464], [861, 486], [875, 528],
    [884, 580], [984, 751], [1038, 837], [1053, 870], [1063, 894], [1074, 932],
    [1143, 1169], [1248, 1529], [1270, 1612], [1268, 1645], [1250, 1672], [1230, 1694],
    [1222, 1722], [1236, 1821], [1236, 1858], [1220, 1886], [1180, 1914], [968, 2043],
    [932, 2056], [898, 2046], [880, 2016], [884, 1982], [910, 1954], [950, 1930],
    [1025, 1892], [1042, 1869], [1044, 1839], [1000, 1713], [987, 1661], [956, 1502],
    [941, 1411], [930, 1379], [905, 1351], [870, 1332], [788, 1325], [764, 1328],
    [742, 1334], [720, 1343], [681, 1375], [668, 1394], [653, 1421], [594, 1568],
    [541, 1699], [526, 1724], [496, 1744], [462, 1750], [430, 1741], [404, 1728],
    [371, 1720], [338, 1726], [309, 1748], [212, 1898], [186, 1924], [150, 1934],
    [112, 1918], [69, 1880], [31, 1847], [11, 1819], [1, 1787], [3, 1748],
    [18, 1707], [31, 1671], [54, 1631], [79, 1596], [117, 1554], [180, 1493],
    [217, 1464], [248, 1446], [410, 1362], [434, 1347], [456, 1330], [476, 1311],
    [494, 1290], [510, 1268], [532, 1228], [550, 1190], [590, 1101], [601, 1060],
    [602, 1034], [598, 1011], [574, 950], [548, 883], [517, 799], [509, 768],
    [501, 731], [496, 696], [494, 667], [489, 580], [496, 545], [522, 524],
    [548, 500], [544, 466], [491, 404], [456, 344], [421, 284], [386, 224],
    [352, 164], [317, 104], [282, 44],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.8,
  // (metres along the lap / 6954 m): the hairpin at the top, down to the bottom of the valley, straight up the
  // steepest climb, on up the long straight to the top of the hill, down and down to the far end of the valley,
  // and the long climb back
  elevation: [
    [0, 44],
    [0.033, 48],
    [0.078, 40],
    [0.161, 0],
    [0.195, 56],
    [0.243, 74],
    [0.339, 116],
    [0.371, 110],
    [0.424, 92],
    [0.456, 76],
    [0.528, 48],
    [0.622, 24],
    [0.695, 4],
    [0.807, 22],
    [0.886, 36],
    [0.913, 42],
    [0.976, 44],
    [1, 44],
  ],
  // on the outside of the straight, from the last chicane to the line
  pit: { from: -856, to: 240, side: -1 },
  // (the longest lap: a set lasts three laps, so a 5-lap race needs one stop at most)
  tyreWear: 0.4,
  forest: true,
};

/**
 * Alpine Ring. Clockwise, on a hillside in the mountains, after the short one
 * there (outline data from the same source, its hairpins opened out a little):
 * the climb to the uphill right of Turn 1, on up the long straight to the
 * hairpin of Turn 3 at the top, the plunge down the back straight to the
 * heavy stop at Turn 4, the sweeping lefts and rights down to the bottom of
 * the valley, and the two fast rights onto the straight. A short lap, about
 * 8500 px, about 27 s, so the field stays close.
 */
export const ALPINE_RING: CircuitLayout = {
  id: 'alpine-ring',
  name: 'Alpine Ring',
  about: 'clockwise · short and steep, in the mountains',
  points: ([
    [803, 700], [776, 708], [749, 715], [721, 722], [694, 729], [667, 737],
    [640, 744], [613, 751], [586, 759], [559, 766], [532, 773], [505, 778],
    [480, 767], [462, 745], [447, 722], [431, 699], [415, 676], [399, 653],
    [383, 630], [367, 607], [352, 583], [336, 560], [320, 537], [305, 514],
    [292, 489], [279, 464], [266, 439], [253, 414], [240, 389], [228, 364],
    [215, 340], [202, 315], [189, 290], [176, 265], [163, 240], [148, 217],
    [129, 197], [110, 176], [90, 156], [71, 136], [51, 116], [32, 95],
    [13, 75], [0, 51], [5, 24], [27, 7], [54, 2], [82, 1],
    [110, 0], [138, 0], [166, 1], [194, 5], [221, 9], [249, 14],
    [277, 18], [304, 23], [332, 27], [360, 32], [387, 36], [415, 40],
    [442, 45], [470, 49], [498, 54], [525, 58], [553, 62], [581, 64],
    [609, 66], [637, 68], [665, 70], [693, 72], [721, 74], [745, 86],
    [757, 111], [750, 137], [734, 160], [712, 178], [689, 194], [665, 207],
    [638, 214], [611, 220], [583, 222], [555, 218], [527, 214], [500, 210],
    [472, 206], [444, 202], [417, 199], [389, 197], [362, 203], [339, 219],
    [323, 241], [315, 268], [319, 296], [327, 322], [341, 346], [355, 370],
    [369, 395], [383, 419], [397, 443], [418, 462], [442, 474], [470, 476],
    [497, 469], [518, 452], [538, 433], [558, 413], [578, 393], [603, 382],
    [630, 372], [656, 362], [683, 359], [711, 359], [739, 358], [767, 358],
    [795, 357], [823, 356], [851, 355], [879, 355], [907, 354], [935, 354],
    [963, 353], [991, 353], [1019, 352], [1047, 351], [1075, 350], [1103, 350],
    [1130, 355], [1156, 367], [1171, 390], [1184, 415], [1192, 442], [1200, 468],
    [1208, 495], [1216, 522], [1217, 550], [1201, 572], [1177, 586], [1152, 599],
    [1127, 612], [1101, 620], [1074, 627], [1046, 634], [1019, 642], [992, 649],
    [965, 656], [938, 664], [911, 671], [884, 678], [857, 685], [830, 693],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 2.0,
  // (a share of the lap): up to Turn 1, on up to the hairpin at the top, down the back straight and down the valley, and back up onto the straight
  elevation: [
    [0, 30],
    [0.09, 46],
    [0.3, 74],
    [0.47, 50],
    [0.55, 36],
    [0.62, 22],
    [0.7, 8],
    [0.8, 4],
    [0.9, 16],
    [1, 30],
  ],
  // on the outside of the main straight, from the last bend to past the line
  pit: { from: -600, to: 480, side: -1 },
  forest: true,
};

/**
 * Twin Lakes. Anticlockwise round a bowl between two lakes, after the one in
 * the big city there (outline data from the same source, its main straight
 * eased straight and its tightest bends opened out a little): down from the
 * line into the left–right of the esses, the long curving back straight down
 * to the lake, the twisty climb through the infield to its highest bends, the
 * dip, the slow left onto the climb, and the long uphill drag flat out to the
 * line. About 8000 px, about 26 s.
 */
export const TWIN_LAKES: CircuitLayout = {
  id: 'twin-lakes',
  name: 'Twin Lakes',
  about: 'anticlockwise · a bowl of a circuit, down and up',
  points: ([
    [93, 729], [100, 756], [107, 784], [114, 811], [121, 838], [128, 865],
    [135, 892], [142, 919], [149, 946], [156, 973], [168, 998], [192, 1011],
    [219, 1005], [244, 993], [271, 999], [297, 1010], [323, 1020], [350, 1024],
    [378, 1023], [405, 1018], [430, 1004], [454, 990], [471, 968], [487, 945],
    [495, 918], [502, 891], [510, 864], [517, 837], [524, 810], [532, 783],
    [539, 756], [547, 729], [554, 702], [561, 675], [568, 648], [576, 621],
    [583, 594], [590, 567], [597, 540], [605, 513], [612, 486], [620, 459],
    [628, 432], [635, 405], [642, 378], [649, 351], [654, 324], [648, 297],
    [628, 278], [601, 270], [573, 265], [546, 261], [518, 259], [490, 263],
    [465, 274], [443, 291], [424, 311], [405, 332], [388, 355], [372, 377],
    [355, 400], [339, 423], [322, 445], [306, 468], [289, 490], [273, 513],
    [256, 535], [240, 558], [221, 578], [197, 593], [169, 591], [147, 574],
    [137, 549], [131, 521], [123, 495], [116, 468], [114, 440], [129, 417],
    [155, 408], [179, 394], [188, 368], [181, 341], [163, 320], [144, 299],
    [126, 278], [116, 253], [121, 226], [142, 208], [170, 208], [192, 224],
    [212, 244], [236, 256], [263, 263], [291, 259], [317, 250], [339, 233],
    [357, 212], [372, 188], [386, 165], [401, 141], [416, 117], [431, 94],
    [440, 67], [430, 42], [407, 27], [380, 18], [354, 9], [327, 0],
    [300, 2], [272, 7], [245, 12], [218, 20], [192, 31], [167, 43],
    [141, 54], [118, 69], [95, 84], [71, 100], [53, 120], [40, 145],
    [32, 172], [28, 200], [27, 228], [27, 256], [25, 284], [19, 311],
    [9, 337], [0, 363], [6, 390], [12, 417], [19, 444], [26, 471],
    [33, 498], [40, 525], [47, 552], [54, 580], [61, 607], [68, 634],
    [75, 661], [82, 688], [89, 715],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 2.0,
  gophers: true,
  // (a share of the lap): down through the esses and the back straight to the lake, up through the infield, down the dip, and the long climb to the line
  elevation: [
    [0, 36],
    [0.08, 26],
    [0.15, 22],
    [0.33, 4],
    [0.4, 0],
    [0.5, 10],
    [0.62, 24],
    [0.72, 30],
    [0.8, 18],
    [0.88, 10],
    [1, 36],
  ],
  // on the outside of the main straight
  pit: { from: -600, to: 460, side: 1 },
  tyreWear: 0.8,
  // the two lakes it's named for: on the outside of the descent to the lake (Turn 4), and beyond the Curva do Sol
  lakes: [
    ([
      [1228, 215], [1202, 297], [1188, 385], [1151, 473], [1071, 522], [975, 519],
      [893, 500], [824, 475], [756, 453], [717, 391], [729, 310], [715, 263],
      [668, 215], [541, 120], [655, 77], [720, 41], [746, -41], [800, -133],
      [893, -150], [974, -85], [1031, -24], [1109, -1], [1197, 40], [1246, 120],
    ] as [number, number][]).map(([x, y]) => ({ x, y })),
    ([
      [1204, 1214], [1177, 1305], [1120, 1377], [1062, 1437], [997, 1487], [922, 1523],
      [839, 1534], [757, 1518], [684, 1482], [630, 1423], [592, 1357], [535, 1296],
      [454, 1214], [414, 1100], [523, 1032], [609, 984], [721, 1010], [781, 997],
      [839, 929], [927, 886], [1014, 911], [1076, 977], [1125, 1049], [1177, 1123],
    ] as [number, number][]).map(([x, y]) => ({ x, y })),
  ],
};

/**
 * Oasis. Clockwise, in the desert, after the one in the sands there (outline
 * data from the same source, its hairpins opened out a little and two
 * stretches eased apart): the long main straight to the heavy stop at Turn 1,
 * the right–left of Turns 2 and 3, the long run to Turn 4, the esses, the
 * hairpin at Turn 8, the downhill left of Turns 9 and 10 (the trickiest
 * braking of the lap), the back straight, the long right of Turns 11 to 13
 * and the last right onto the straight. Sand all round. About 9300 px,
 * about 30 s.
 */
export const OASIS: CircuitLayout = {
  id: 'oasis',
  name: 'Oasis',
  about: 'clockwise · in the desert, under the lights, hard on the brakes',
  points: ([
    [32, 367], [33, 339], [34, 311], [35, 283], [36, 255], [38, 227],
    [39, 199], [40, 171], [41, 143], [42, 115], [43, 87], [44, 59],
    [49, 32], [68, 12], [95, 6], [120, 17], [147, 22], [174, 15],
    [201, 7], [229, 1], [257, 0], [284, 4], [312, 10], [339, 15],
    [367, 20], [394, 26], [422, 31], [449, 37], [476, 42], [504, 47],
    [531, 52], [559, 58], [586, 63], [614, 68], [642, 73], [669, 79],
    [697, 84], [724, 89], [752, 94], [777, 105], [791, 129], [789, 156],
    [772, 178], [751, 196], [729, 214], [707, 231], [686, 250], [667, 270],
    [647, 290], [630, 312], [618, 337], [605, 362], [589, 384], [564, 394],
    [536, 391], [508, 388], [481, 391], [454, 398], [435, 418], [417, 440],
    [399, 462], [381, 483], [356, 496], [329, 492], [309, 473], [304, 445],
    [307, 418], [311, 390], [313, 362], [314, 334], [316, 306], [319, 278],
    [313, 251], [292, 233], [265, 230], [241, 244], [230, 269], [226, 297],
    [221, 325], [216, 352], [213, 380], [210, 408], [207, 436], [204, 464],
    [201, 491], [199, 519], [199, 547], [202, 575], [206, 603], [209, 631],
    [210, 659], [209, 687], [208, 715], [207, 743], [206, 771], [204, 799],
    [205, 826], [217, 851], [241, 865], [269, 870], [296, 866], [321, 853],
    [345, 839], [364, 818], [382, 797], [394, 772], [404, 746], [415, 720],
    [428, 695], [448, 676], [472, 662], [498, 651], [525, 649], [553, 651],
    [579, 660], [604, 672], [629, 684], [654, 697], [679, 710], [700, 728],
    [712, 753], [709, 780], [692, 803], [671, 820], [647, 834], [622, 848],
    [598, 861], [573, 874], [549, 888], [524, 902], [500, 916], [475, 929],
    [451, 943], [426, 956], [402, 970], [377, 984], [353, 997], [328, 1010],
    [304, 1024], [279, 1038], [255, 1051], [230, 1065], [206, 1079], [182, 1092],
    [157, 1106], [133, 1120], [108, 1133], [84, 1147], [57, 1153], [31, 1143],
    [16, 1120], [6, 1094], [0, 1067], [2, 1039], [3, 1011], [4, 983],
    [5, 955], [7, 927], [8, 899], [9, 871], [10, 843], [12, 815],
    [13, 787], [15, 759], [16, 731], [17, 703], [19, 675], [20, 647],
    [21, 619], [22, 591], [24, 563], [25, 535], [26, 507], [27, 479],
    [29, 451], [30, 423], [31, 395],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.8,
  // (a share of the lap): nearly flat, up a little to the esses and down the hill into Turns 9 and 10
  elevation: [
    [0, 10],
    [0.1, 8],
    [0.25, 16],
    [0.36, 26],
    [0.42, 12],
    [0.5, 14],
    [0.62, 10],
    [0.75, 6],
    [0.9, 8],
    [1, 10],
  ],
  // on the outside of the main straight
  pit: { from: -660, to: 460, side: -1 },
  tyreWear: 0.6,
  desert: true,
};

/**
 * Baku. Anticlockwise through the old city on the Caspian, after the one there
 * (outline data from the same source, its right-angled corners and the castle
 * section opened out a little so the cars fit): from the line, the left and the
 * right-angle rights and lefts of the new town, up through the narrow, twisting
 * castle section under the old city walls to the top of the hill, round the old
 * town and down again to the sea front, and the longest run flat out anywhere,
 * curving along the sea front for 2000 px and more back to the line. Walls all
 * the way round, the pits on the town side of the straight and the sea up to its barriers on the other. About 11,500 px, about 36 s.
 */
export const BAKU: CircuitLayout = {
  id: 'baku',
  name: 'Caspian Shores',
  about: 'anticlockwise · the castle, then flat out by the sea',
  points: ([
    [1893, 372], [1919, 361], [1945, 350], [1971, 339], [1996, 328], [2022, 317],
    [2044, 300], [2051, 274], [2043, 247], [2034, 220], [2025, 194], [2013, 169],
    [2000, 144], [1988, 118], [1976, 93], [1964, 68], [1952, 43], [1939, 18],
    [1917, 1], [1890, 0], [1864, 10], [1838, 20], [1811, 30], [1785, 40],
    [1759, 51], [1733, 61], [1707, 71], [1681, 81], [1655, 91], [1629, 101],
    [1603, 111], [1577, 122], [1551, 134], [1526, 145], [1500, 157], [1475, 168],
    [1449, 180], [1424, 192], [1398, 203], [1373, 215], [1347, 226], [1322, 237],
    [1296, 248], [1271, 260], [1245, 272], [1220, 283], [1194, 295], [1168, 306],
    [1145, 322], [1135, 347], [1141, 374], [1150, 401], [1160, 427], [1169, 453],
    [1179, 480], [1188, 506], [1187, 534], [1169, 555], [1145, 569], [1121, 583],
    [1097, 597], [1072, 611], [1048, 624], [1023, 638], [999, 651], [974, 665],
    [950, 678], [925, 692], [910, 715], [898, 740], [875, 756], [853, 772],
    [830, 789], [808, 807], [787, 824], [765, 842], [743, 859], [721, 876],
    [699, 894], [677, 911], [654, 928], [630, 941], [603, 939], [583, 920],
    [573, 894], [564, 867], [555, 841], [538, 819], [513, 808], [486, 800],
    [459, 793], [441, 772], [424, 750], [397, 744], [370, 750], [343, 758],
    [316, 767], [291, 779], [266, 791], [241, 804], [216, 816], [191, 828],
    [166, 842], [142, 857], [119, 872], [95, 887], [72, 903], [58, 927],
    [45, 952], [38, 979], [30, 1006], [23, 1033], [15, 1060], [8, 1087],
    [0, 1114], [1, 1142], [4, 1170], [6, 1197], [9, 1225], [11, 1253],
    [13, 1281], [16, 1309], [24, 1335], [45, 1353], [70, 1367], [94, 1380],
    [119, 1393], [143, 1407], [168, 1421], [192, 1435], [217, 1448], [243, 1459],
    [268, 1469], [294, 1480], [322, 1480], [346, 1467], [362, 1445], [377, 1421],
    [391, 1397], [404, 1372], [418, 1348], [433, 1324], [451, 1303], [471, 1284],
    [491, 1264], [512, 1245], [532, 1226], [553, 1207], [573, 1188], [593, 1168],
    [611, 1147], [616, 1119], [622, 1092], [633, 1067], [654, 1048], [675, 1029],
    [697, 1013], [719, 995], [741, 978], [763, 960], [785, 943], [807, 926],
    [829, 908], [851, 891], [873, 873], [895, 856], [917, 840], [941, 824],
    [962, 807], [982, 787], [1000, 765], [1021, 748], [1046, 735], [1072, 724],
    [1098, 713], [1124, 702], [1149, 691], [1175, 680], [1201, 669], [1227, 658],
    [1252, 647], [1278, 636], [1304, 625], [1330, 614], [1355, 603], [1381, 592],
    [1407, 581], [1433, 570], [1458, 559], [1484, 547], [1510, 536], [1535, 525],
    [1561, 515], [1587, 504], [1613, 492], [1638, 481], [1664, 470], [1690, 459],
    [1716, 448], [1741, 437], [1767, 426], [1793, 415], [1819, 404], [1844, 393],
    [1870, 382],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 1.9,
  // (a share of the lap): flat along the new town, the climb through the castle section to the old town at the top,
  // down again to the sea front, and flat along it to the line
  elevation: [
    [0, 4],
    [0.1, 4],
    [0.2, 8],
    [0.27, 14],
    [0.34, 24],
    [0.4, 30],
    [0.48, 32],
    [0.56, 26],
    [0.64, 16],
    [0.72, 6],
    [0.8, 2],
    [1, 4],
  ],
  // on the town side of the straight, away from the sea
  pit: { from: -950, to: 100, side: -1 },
  // (on the garages' roofs, as at the race it's after)
  pitRoof: 'AZERBAIJAN',
  // (a long lap of streets: easy on tyres)
  tyreWear: 0.4,
  street: {
    runoff: 28,
    // the Caspian, right up to the barriers along the sea front (a quay between) as far as the line; past it the shore
    // turns away south-east, and the land round the hairpin is the Crescent's
    sea: ([
      [677, 1114], [708, 1078], [989, 861], [1055, 797], [1850, 456], [1990, 590], [2500, 1100], [4307, 2635],
      [2144, 3787],
    ] as [number, number][]).map(([x, y]) => ({ x, y })),
    // Qız Qalası, the Maiden Tower, in the old town inside the walls, by the stretch out of the castle section onto the
    // sea front; the Flame Towers on the hill above it, to the north-west; and the Crescent past the line, by the run
    // to the hairpin, where the shore turns away
    landmarks: { maiden: { x: 515, y: 1125 }, flames: { x: 210, y: 640 }, crescent: { x: 2088, y: 383 } },
    // the old city walls along the castle section, on its inside, round the old town (on the camera's side of the
    // track there, kept low enough to see the racing surface over)
    castle: { from: 0.39, to: 0.53, side: -1 },
  },
};

/**
 * Suzuka. The figure of eight, after the one in Japan (outline data from the
 * same source, its tightest bends opened out a little; points in tenths of a
 * metre): down the main straight into the fast right of Turns 1 and 2, up
 * through the snaking esses to Dunlop, the two rights of Degner, under the
 * bridge, the hairpin, the long right of 200R up to Spoon's double left, the
 * back straight over the bridge, flat out through 130R, the chicane and the
 * last bend onto the straight. The one circuit that crosses itself: the back
 * straight climbs onto a bridge (bridge.ts) over the stretch after Degner. About
 * 10,200 px, about 31 s.
 */
export const SUZUKA: CircuitLayout = {
  id: 'suzuka',
  name: 'Nippon',
  about: 'a figure of eight · the esses, over the bridge, 130R',
  points: ([
    [16731, 5575], [16911, 5790], [17090, 6005], [17270, 6220], [17449, 6435], [17629, 6650],
    [17808, 6865], [17987, 7080], [18167, 7295], [18345, 7511], [18522, 7728], [18701, 7943],
    [18879, 8159], [19055, 8376], [19233, 8593], [19412, 8808], [19527, 9056], [19580, 9331],
    [19552, 9603], [19477, 9872], [19368, 10125], [19168, 10321], [18902, 10391], [18642, 10315],
    [18418, 10154], [18256, 9925], [18097, 9694], [17942, 9461], [17782, 9231], [17621, 9003],
    [17459, 8774], [17259, 8583], [16986, 8530], [16707, 8502], [16436, 8440], [16191, 8308],
    [16057, 8065], [15950, 7806], [15841, 7548], [15732, 7290], [15622, 7033], [15416, 6854],
    [15163, 6745], [14884, 6715], [14606, 6688], [14328, 6656], [14084, 6521], [13910, 6311],
    [13796, 6057], [13777, 5778], [13846, 5507], [13923, 5238], [14000, 4969], [14067, 4698],
    [13992, 4432], [13852, 4195], [13617, 4044], [13366, 3925], [13097, 3847], [12823, 3790],
    [12545, 3769], [12267, 3801], [11987, 3799], [11733, 3902], [11504, 4062], [11275, 4223],
    [11047, 4383], [10859, 4591], [10654, 4781], [10435, 4956], [10224, 5140], [10032, 5343],
    [9844, 5551], [9589, 5651], [9311, 5679], [9032, 5705], [8753, 5731], [8474, 5749],
    [8209, 5673], [8041, 5455], [7970, 5185], [7905, 4912], [7843, 4639], [7794, 4363],
    [7747, 4087], [7700, 3811], [7652, 3536], [7604, 3260], [7557, 2984], [7538, 2706],
    [7547, 2427], [7423, 2183], [7163, 2151], [6945, 2320], [6795, 2556], [6609, 2763],
    [6400, 2949], [6167, 3099], [5900, 3185], [5623, 3164], [5347, 3119], [5070, 3079],
    [4794, 3036], [4531, 2941], [4265, 2854], [4001, 2763], [3737, 2668], [3477, 2568],
    [3238, 2422], [2996, 2281], [2763, 2129], [2554, 1943], [2351, 1750], [2191, 1524],
    [2079, 1267], [1973, 1008], [1867, 749], [1759, 491], [1616, 252], [1409, 76],
    [1141, 0], [862, 27], [584, 61], [327, 160], [100, 321], [0, 578],
    [7, 853], [141, 1098], [313, 1316], [521, 1503], [731, 1688], [942, 1872],
    [1170, 2035], [1399, 2196], [1617, 2370], [1824, 2559], [2019, 2760], [2238, 2934],
    [2474, 3085], [2714, 3228], [2957, 3368], [3208, 3492], [3470, 3589], [3737, 3673],
    [4002, 3765], [4265, 3861], [4530, 3950], [4804, 4009], [5081, 4044], [5359, 4081],
    [5636, 4124], [5911, 4175], [6182, 4246], [6448, 4333], [6712, 4425], [6977, 4518],
    [7241, 4610], [7506, 4699], [7772, 4788], [8036, 4881], [8302, 4965], [8579, 4933],
    [8855, 4889], [9108, 4768], [9354, 4635], [9587, 4480], [9787, 4287], [9983, 4087],
    [10186, 3894], [10386, 3698], [10603, 3521], [10836, 3366], [11069, 3210], [11299, 3052],
    [11533, 2897], [11781, 2772], [12055, 2803], [12328, 2846], [12592, 2753], [12849, 2642],
    [13107, 2546], [13385, 2571], [13665, 2587], [13933, 2654], [14191, 2764], [14423, 2918],
    [14643, 3092], [14831, 3298], [15010, 3513], [15190, 3728], [15369, 3943], [15548, 4158],
    [15728, 4373], [15907, 4588], [16087, 4803], [16266, 5017], [16446, 5232], [16625, 5447],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 0.185,
  // (a share of the lap): down to Turn 1, up the esses to Dunlop, down through Degner to the crossing, the hairpin
  // at the bottom, up 200R to Spoon at the top, down the back straight to the crossing (at the same height as the
  // stretch it crosses: the bridge lifts the back straight over it), 130R, and up to the line
  elevation: [
    [0, 24],
    [0.08, 18],
    [0.12, 14],
    [0.2, 26],
    [0.28, 40],
    [0.34, 34],
    [0.4111, 20],
    [0.46, 12],
    [0.52, 20],
    [0.6, 38],
    [0.66, 42],
    [0.74, 30],
    [0.8015, 20],
    [0.86, 16],
    [0.92, 18],
    [1, 24],
  ],
  // on the inside of the main straight
  pit: { from: -500, to: 620, side: 1 },
  // (a 31 s lap, the esses hard on them: a stop in five laps a choice, not a must)
  tyreWear: 0.5,
  // the back straight over the stretch after Degner
  bridge: { over: 8188, under: 4200, height: 36 },
  // (spring: the cherry trees in blossom)
  blossoms: true,
};

/**
 * Glacier Pass. Clockwise over a mountain pass, a circuit of our own: from the
 * valley floor down the main straight to Turn 1, up the switchbacks (three
 * hairpins stacked up the mountainside, the climb steady all the way), along
 * the summit and over the Crest, a jump the cars fly off at full speed, then
 * down off the mountain, back through the infield over the Kicker, a second
 * jump, and the long sweep onto the main straight. About 10300 px, about 33 s.
 */
export const GLACIER_PASS: CircuitLayout = {
  id: 'glacier-pass',
  name: 'Glacier Pass',
  about: 'clockwise · up the switchbacks, over two jumps',
  points: ([
    [0, 0], [20, 0], [40, 0], [61, 0], [81, 0], [101, 0],
    [121, 0], [142, 0], [162, 0], [182, 0], [202, 0], [223, 0],
    [243, 0], [263, 0], [283, 0], [304, 0], [324, 0], [344, 0],
    [364, 0], [384, 0], [405, 0], [425, 0], [444, 3], [463, 10],
    [478, 22], [490, 38], [498, 56], [500, 75], [500, 96], [500, 116],
    [500, 137], [500, 157], [500, 178], [500, 198], [500, 218], [500, 239],
    [500, 259], [500, 280], [500, 300], [502, 321], [507, 341], [516, 360],
    [528, 377], [543, 392], [560, 404], [579, 413], [600, 419], [620, 420],
    [641, 420], [662, 420], [683, 420], [704, 420], [725, 420], [745, 420],
    [762, 427], [768, 443], [768, 466], [768, 488], [762, 505], [745, 512],
    [725, 512], [705, 512], [685, 512], [665, 512], [645, 512], [625, 512],
    [605, 512], [585, 512], [565, 512], [545, 512], [525, 512], [505, 512],
    [485, 512], [465, 512], [445, 512], [429, 518], [422, 535], [422, 557],
    [422, 580], [429, 596], [445, 603], [465, 603], [485, 603], [505, 603],
    [525, 603], [545, 603], [565, 603], [585, 603], [605, 603], [625, 603],
    [645, 603], [665, 603], [685, 603], [705, 603], [725, 603], [745, 603],
    [762, 610], [768, 626], [768, 648], [768, 671], [762, 687], [745, 694],
    [727, 694], [708, 694], [689, 694], [670, 694], [652, 694], [633, 694],
    [614, 694], [595, 694], [575, 696], [556, 703], [539, 714], [525, 728],
    [514, 745], [507, 764], [505, 784], [505, 804], [505, 824], [505, 844],
    [505, 864], [505, 884], [503, 904], [498, 922], [488, 940], [476, 955],
    [461, 967], [443, 977], [425, 982], [405, 984], [384, 984], [363, 984],
    [342, 984], [321, 984], [300, 984], [279, 984], [258, 984], [237, 984],
    [216, 984], [195, 984], [175, 984], [155, 984], [135, 984], [115, 984],
    [95, 984], [75, 984], [55, 984], [35, 984], [15, 984], [-5, 984],
    [-25, 984], [-45, 984], [-65, 984], [-85, 984], [-105, 984], [-125, 984],
    [-145, 984], [-165, 984], [-184, 983], [-202, 978], [-220, 970], [-236, 958],
    [-249, 945], [-260, 929], [-268, 912], [-273, 893], [-275, 874], [-275, 855],
    [-275, 837], [-275, 818], [-275, 799], [-275, 780], [-275, 762], [-275, 743],
    [-275, 724], [-277, 705], [-282, 686], [-292, 668], [-304, 653], [-319, 641],
    [-337, 632], [-355, 626], [-375, 624], [-396, 624], [-418, 624], [-439, 624],
    [-460, 624], [-481, 624], [-502, 624], [-522, 624], [-543, 624], [-564, 624],
    [-585, 624], [-604, 622], [-623, 617], [-640, 609], [-656, 598], [-669, 585],
    [-680, 569], [-688, 552], [-694, 533], [-695, 514], [-695, 494], [-695, 474],
    [-695, 455], [-695, 435], [-695, 415], [-695, 396], [-695, 376], [-695, 356],
    [-695, 337], [-695, 317], [-695, 297], [-695, 278], [-695, 258], [-695, 238],
    [-695, 219], [-695, 199], [-695, 179], [-695, 160], [-695, 140], [-695, 120],
    [-693, 99], [-688, 79], [-679, 60], [-667, 43], [-652, 28], [-635, 16],
    [-616, 7], [-596, 2], [-575, 0], [-555, 0], [-535, 0], [-516, 0],
    [-496, 0], [-476, 0], [-456, 0], [-436, 0], [-416, 0], [-397, 0],
    [-377, 0], [-357, 0], [-337, 0], [-317, 0], [-297, 0], [-278, 0],
    [-258, 0], [-238, 0], [-218, 0], [-198, 0], [-178, 0], [-159, 0],
    [-139, 0], [-119, 0], [-99, 0], [-79, 0], [-60, 0], [-40, 0],
    [-20, 0],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 2,
  // (a share of the lap): the valley floor, up the switchbacks to the summit, along it, down off the mountain (the
  // Kicker where it eases) and down onto the main straight
  elevation: [
    [0, 20],
    [0.1, 22],
    [0.2, 56],
    [0.3, 98],
    [0.4, 140],
    [0.47, 170],
    [0.51, 180],
    [0.6, 182],
    [0.65, 162],
    [0.7, 124],
    [0.72, 118],
    [0.745, 112],
    [0.8, 72],
    [0.86, 28],
    [1, 20],
  ],
  // on the right of the main straight, from the last bend to past the line
  pit: { from: -740, to: 640, side: 1 },
  // the Crest, along the summit, and the Kicker, on the way back down
  jumps: [{ at: 5575, rise: 28 }, { at: 7425, rise: 26 }],
  mountain: true,
  // (in winter: under snow, a yeti about, and the tramway up from the infield to the summit)
  snow: true,
  yeti: true,
  tramway: { from: [1600, 900], to: [1700, 2095] },
  // (open to everyone from the start, not a round of the Championship)
  free: true,
};

/**
 * Dust Bowl. Clockwise on dirt, a rallycross circuit of our own: down the main
 * straight into a fast right, through the twisty section (a tight right, a
 * left, the hairpin), the long back straight over the jump, the kink and the
 * sweeping right onto the main straight. Every car on off-road tyres (tyres.ts:
 * the circuit's `dirt`), sliding through the bends. About 6300 px, about 21 s.
 */
export const DUST_BOWL: CircuitLayout = {
  id: 'dust-bowl',
  name: 'Dust Bowl',
  about: 'clockwise · on dirt, off-road tyres, over the jump',
  points: ([
    [0, 0], [20, 0], [40, 0], [60, 0], [80, 0], [100, 0],
    [120, 0], [140, 0], [160, 0], [180, 0], [200, 0], [220, 0],
    [240, 0], [260, 0], [280, 0], [299, 3], [315, 11], [329, 25],
    [337, 41], [340, 60], [340, 80], [340, 100], [340, 120], [340, 140],
    [340, 160], [336, 179], [325, 195], [309, 206], [290, 210], [270, 210],
    [250, 210], [230, 210], [211, 214], [195, 225], [184, 241], [180, 260],
    [180, 280], [180, 300], [180, 320], [180, 340], [183, 359], [191, 375],
    [205, 389], [221, 397], [240, 400], [260, 400], [280, 400], [300, 400],
    [320, 400], [340, 400], [360, 400], [381, 404], [399, 414], [412, 430],
    [419, 450], [419, 470], [412, 490], [399, 506], [381, 516], [360, 520],
    [340, 520], [320, 520], [300, 520], [280, 520], [260, 520], [240, 520],
    [220, 520], [200, 520], [180, 520], [160, 520], [140, 520], [120, 520],
    [100, 520], [80, 520], [60, 520], [40, 520], [20, 520], [0, 520],
    [-20, 520], [-40, 520], [-60, 520], [-80, 520], [-100, 520], [-120, 520],
    [-140, 520], [-160, 520], [-180, 520], [-200, 520], [-220, 520], [-240, 520],
    [-260, 520], [-280, 520], [-300, 520], [-320, 520], [-340, 520], [-360, 520],
    [-380, 520], [-400, 520], [-420, 520], [-440, 520], [-460, 520], [-480, 520],
    [-500, 520], [-520, 520], [-542, 517], [-561, 507], [-577, 491], [-587, 472],
    [-590, 450], [-590, 430], [-590, 410], [-590, 390], [-590, 370], [-585, 349],
    [-572, 332], [-559, 315], [-554, 293], [-554, 273], [-554, 253], [-554, 232],
    [-554, 212], [-554, 192], [-554, 172], [-554, 151], [-554, 131], [-554, 111],
    [-554, 90], [-554, 70], [-551, 48], [-541, 29], [-525, 13], [-506, 3],
    [-484, 0], [-464, 0], [-444, 0], [-424, 0], [-404, 0], [-383, 0],
    [-363, 0], [-343, 0], [-323, 0], [-303, 0], [-282, 0], [-262, 0],
    [-242, 0], [-222, 0], [-202, 0], [-182, 0], [-161, 0], [-141, 0],
    [-121, 0], [-101, 0], [-81, 0], [-61, 0], [-40, 0], [-20, 0],
  ] as [number, number][]).map(([x, y]) => ({ x, y })),
  scale: 2,
  // (a share of the lap): a gentle rise through the twisty section, down the back straight, and up again to the line
  elevation: [
    [0, 12],
    [0.15, 16],
    [0.3, 26],
    [0.43, 20],
    [0.69, 8],
    [0.85, 14],
    [1, 12],
  ],
  // on the right of the main straight, from well past the last bend (whose inside, sliding out of it on the loose
  // earth, a car can run wide onto: not into the pit lane) to past the line
  pit: { from: -700, to: 400, side: 1 },
  // the jump, half-way down the back straight
  jumps: [{ at: 3220, rise: 20 }],
  // on dirt: every car on off-road tyres
  dirt: true,
  // (and monster trucks in the infield, jumping a pile of wrecks alongside the back straight)
  monsterTrucks: { at: [1040, 1100], angle: 0 },
  // (and the crowd in the grandstands on its feet, cheering the cars by)
  crowds: true,
  // (open to everyone from the start, not a round of the Championship)
  free: true,
};

export const LAYOUTS: CircuitLayout[] = [CRESCENT_PARK, SILVER_HEATH, HARBOUR, ROYAL_PARK, ARDENNES, ALPINE_RING, TWIN_LAKES, OASIS, BAKU, SUZUKA, GLACIER_PASS, DUST_BOWL];

/** The Championship's circuits, a round on each, in order (the free circuits aren't among them). */
export const CHAMPIONSHIP_LAYOUTS: CircuitLayout[] = LAYOUTS.filter((l) => !l.free);
/** The free circuits: open to everyone from the start. */
export const FREE_LAYOUTS: CircuitLayout[] = LAYOUTS.filter((l) => l.free);

/** The layout with this id, or undefined. */
export function layoutById(id: string | null | undefined): CircuitLayout | undefined {
  return LAYOUTS.find((l) => l.id === id);
}
